import importlib.util
import tempfile
import unittest
import os
import collections
import contextlib
import io
import json
import subprocess
import time
from unittest import mock
from pathlib import Path

spec=importlib.util.spec_from_file_location('retention',Path(__file__).with_name('retention-cleanup.py'))
retention=importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)

class RetentionTests(unittest.TestCase):
    def test_only_cleaned_uploads_qualify(self):
        record=dict(state='cleaned',archive_sha256='a'*64,archive_size=1024,object_key='session-recorder-v1/synthapi/aliyun-prod/test',failed_count=0)
        self.assertTrue(retention.completed_manifest(record))
        for update in [dict(state='archived'),dict(failed_count=1),dict(archive_sha256=''),dict(object_key='other/path')]:
            self.assertFalse(retention.completed_manifest(dict(record,**update)))

    def test_proof_maps_to_redacted_copy_without_path_escape(self):
        self.assertEqual(retention.feishu_name({'relative_path':'user_abcdef_session123/0001_resp_123.json'}),'session123__resp_123.json')
        self.assertIsNone(retention.feishu_name({'relative_path':'../../secret.json'}))
        self.assertIsNone(retention.feishu_name({'relative_path':'/tmp/0001_resp.json'}))

    def test_current_and_recent_releases_are_protected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);now=1000000
            dirs=[]
            for i in range(6):
                p=root/str(i);p.mkdir();os.utime(p,(now-i*86400,now-i*86400));dirs.append(p)
            (root/'linked').symlink_to(dirs[4],target_is_directory=True)
            result=retention.release_candidates(root,dirs[5],now)
            self.assertEqual(set(result),{dirs[3],dirs[4]})

    def test_retention_shortens_only_under_disk_pressure(self):
        self.assertEqual(retention.retention_seconds(5*retention.GIB), 6*3600)
        self.assertEqual(retention.retention_seconds(5*retention.GIB-1), 3600)
        self.assertEqual(retention.retention_seconds(0), 3600)

    def test_changed_and_linked_files_survive_deletion(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            stable=root/'stable'; stable.write_text('archived')
            changed=root/'changed'; changed.write_text('original')
            replaced=root/'replaced'; replaced.write_text('original')
            target=root/'unrelated'; target.write_text('keep me')
            sources=[(p,p.stat()) for p in [stable,changed,replaced]]
            changed.write_text('new contents after inspection')
            replaced.unlink(); replaced.symlink_to(target)
            report=collections.Counter()
            retention.delete_verified_sources(sources,report)
            self.assertFalse(stable.exists())
            self.assertTrue(changed.exists())
            self.assertTrue(replaced.is_symlink())
            self.assertEqual(target.read_text(),'keep me')
            self.assertEqual(report['feishu_files_deleted'],1)
            self.assertEqual(report['changed_files_kept'],2)

    def test_legacy_backups_keep_recent_and_nonbinary_data(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); now=time.time(); binaries=[]
            for i in range(5):
                folder=root/str(i);folder.mkdir()
                binary=folder/'synthapi-server.backup';binary.write_bytes(b'\x7fELFarchive')
                sql=folder/'synthapi-server.sql';sql.write_text('database backup')
                config=folder/'config.json';config.write_text('{}')
                for p in [binary,sql,config]: os.utime(p,(now-(30+i)*86400,now-(30+i)*86400))
                os.utime(folder,(now-i*86400,now-i*86400));binaries.append(binary)
            (root/'link').symlink_to(root/'4',target_is_directory=True)
            for i in range(5,9): (root/str(i)).mkdir()
            os.utime(root/'4',(now,now))
            self.assertEqual(set(retention.legacy_binary_candidates(root,now)),set(binaries[3:]))

    def test_r2_requires_exact_size_hash_and_success(self):
        record=dict(archive_size=1024,archive_sha256='a'*64,object_key='session-recorder-v1/test')
        config=dict(endpoint='https://example.invalid',bucket='bucket')
        valid='HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 200\r\ncontent-length: 1024\r\nx-amz-meta-session-recorder-sha256: '+'a'*64+'\r\n'
        cases=[(valid,0,True),(valid.replace('1024','1023'),0,False),
               (valid.replace('a'*64,'b'*64),0,False),
               (valid.replace('HTTP/2 200','HTTP/2 404'),0,False),
               (valid,28,False)]
        with mock.patch.object(Path,'read_text',return_value='fake-credential'):
            for headers,code,expected in cases:
                with self.subTest(code=code,headers=headers), mock.patch.object(retention.subprocess,'run',return_value=subprocess.CompletedProcess([],code,headers,'')):
                    self.assertEqual(retention.verify_remote(record,config),expected)

    def test_verification_timeout_keeps_files(self):
        with mock.patch.object(retention,'verify_remote',side_effect=subprocess.TimeoutExpired('curl',15)):
            self.assertFalse(retention.verify_safely({},{}))

    def test_cleanup_keeps_unverified_pending_and_recent_files(self):
        for verified in [False,True]:
            with self.subTest(verified=verified), tempfile.TemporaryDirectory() as temp, contextlib.ExitStack() as stack:
                root=Path(temp)
                locations={name:root/name for name in ['APP','RELEASES','RECORDER','FEISHU','STATE']}
                for name,path in locations.items():
                    path.mkdir();stack.enter_context(mock.patch.object(retention,name,path))
                manifests=locations['RECORDER']/'upload-work/manifests';manifests.mkdir(parents=True)
                config=root/'upload.json';config.write_text(json.dumps({'r2':{}}))
                stack.enter_context(mock.patch.object(retention,'UPLOAD_CONFIG',config))
                now=time.time()
                for name,state,age in [('old','cleaned',7200),('pending','archived',7200),('recent','cleaned',1800)]:
                    record=dict(state=state,archive_sha256='a'*64,archive_size=1024,
                                object_key='session-recorder-v1/synthapi/aliyun-prod/'+name,failed_count=0,
                                sources=[dict(relative_path='user_abcdef_session/0001_resp_'+name+'.json')])
                    (manifests/(name+'.json')).write_text(json.dumps(record))
                    path=locations['FEISHU']/('session__resp_'+name+'.json');path.write_text('{}')
                    os.utime(path,(now-age,now-age))
                stack.enter_context(mock.patch.object(retention,'legacy_binary_candidates',return_value=[]))
                stack.enter_context(mock.patch.object(retention.subprocess,'run',return_value=subprocess.CompletedProcess([],1)))
                stack.enter_context(mock.patch.object(retention.shutil,'disk_usage',return_value=type('Usage',(),{'free':retention.GIB})()))
                check=stack.enter_context(mock.patch.object(retention,'verify_safely',return_value=verified))
                refresh=stack.enter_context(mock.patch.object(retention,'refresh_feishu_metadata'))
                stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
                retention.clean(apply=True,max_batches=10,workers=1)
                self.assertEqual(check.call_count,1)
                self.assertEqual((locations['FEISHU']/'session__resp_old.json').exists(),not verified)
                for name in ['pending','recent']:
                    self.assertTrue((locations['FEISHU']/('session__resp_'+name+'.json')).exists())
                self.assertEqual(refresh.call_count,int(verified))

if __name__=='__main__': unittest.main()
