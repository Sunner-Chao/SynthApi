import importlib.util
import tempfile
import unittest
import os
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

if __name__=='__main__': unittest.main()
