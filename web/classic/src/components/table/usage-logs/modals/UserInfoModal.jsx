/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React from 'react';
import { Modal, Badge } from '@douyinfe/semi-ui';
import { renderQuota, renderNumber } from '../../../../helpers';

const UserInfoModal = ({
  showUserInfo,
  setShowUserInfoModal,
  userInfoData,
  t,
}) => {
  const infoItemStyle = {
    marginBottom: '16px',
  };

  const labelStyle = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '2px',
    fontSize: '12px',
    color: 'var(--semi-color-text-2)',
    gap: '6px',
  };

  const renderLabel = (text, type = 'tertiary') => (
    <div style={labelStyle}>
      <Badge dot type={type} />
      {text}
    </div>
  );

  const valueStyle = {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--semi-color-text-0)',
  };

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '16px',
    gap: '20px',
  };

  const colStyle = {
    flex: 1,
    minWidth: 0,
  };

  const rewardSummary = userInfoData?.reward_summary;

  return (
    <Modal
      title={t('用户信息')}
      visible={showUserInfo}
      onCancel={() => setShowUserInfoModal(false)}
      footer={null}
      centered
      closable
      maskClosable
      width={600}
    >
      {userInfoData && (
        <div style={{ padding: 20 }}>
          {/* 基本信息 */}
          <div style={rowStyle}>
            <div style={colStyle}>
              {renderLabel(t('用户名'), 'primary')}
              <div style={valueStyle}>{userInfoData.username}</div>
            </div>
            {userInfoData.display_name && (
              <div style={colStyle}>
                {renderLabel(t('显示名称'), 'primary')}
                <div style={valueStyle}>{userInfoData.display_name}</div>
              </div>
            )}
          </div>

          {/* 余额信息 */}
          <div style={rowStyle}>
            <div style={colStyle}>
              {renderLabel(t('余额'), 'success')}
              <div style={valueStyle}>{renderQuota(userInfoData.quota)}</div>
            </div>
            <div style={colStyle}>
              {renderLabel(t('已用额度'), 'warning')}
              <div style={valueStyle}>
                {renderQuota(userInfoData.used_quota)}
              </div>
            </div>
          </div>

          {/* 统计信息 */}
          <div style={rowStyle}>
            <div style={colStyle}>
              {renderLabel(t('请求次数'), 'warning')}
              <div style={valueStyle}>
                {renderNumber(userInfoData.request_count)}
              </div>
            </div>
            {userInfoData.group && (
              <div style={colStyle}>
                {renderLabel(t('用户组'), 'tertiary')}
                <div style={valueStyle}>{userInfoData.group}</div>
              </div>
            )}
          </div>

          {/* 邀请信息 */}
          {(userInfoData.aff_code || userInfoData.aff_count !== undefined) && (
            <div style={rowStyle}>
              {userInfoData.aff_code && (
                <div style={colStyle}>
                  {renderLabel(t('邀请码'), 'tertiary')}
                  <div style={valueStyle}>{userInfoData.aff_code}</div>
                </div>
              )}
              {userInfoData.aff_count !== undefined && (
                <div style={colStyle}>
                  {renderLabel(t('邀请人数'), 'tertiary')}
                  <div style={valueStyle}>
                    {renderNumber(userInfoData.aff_count)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 邀请获得额度 */}
          {userInfoData.aff_quota !== undefined &&
            userInfoData.aff_quota > 0 && (
              <div style={infoItemStyle}>
                {renderLabel(t('邀请获得额度'), 'success')}
                <div style={valueStyle}>
                  {renderQuota(userInfoData.aff_quota)}
                </div>
              </div>
            )}

          {rewardSummary && (
            <div
              style={{
                marginBottom: 16,
                padding: 16,
                border: '1px solid var(--semi-color-border)',
                borderRadius: 8,
                background: 'var(--semi-color-fill-0)',
              }}
            >
              <div style={{ ...valueStyle, marginBottom: 14 }}>
                {t('邀请返利与千元充能')}
              </div>
              <div style={rowStyle}>
                <div style={colStyle}>
                  {renderLabel(t('返利等级'), 'warning')}
                  <div style={valueStyle}>
                    {rewardSummary.affiliate?.current_stage?.name || '-'}
                  </div>
                </div>
                <div style={colStyle}>
                  {renderLabel(t('有效付费邀请'), 'success')}
                  <div style={valueStyle}>
                    {renderNumber(
                      rewardSummary.affiliate?.effective_invite_count || 0,
                    )}
                  </div>
                </div>
                <div style={colStyle}>
                  {renderLabel(t('累计返利'), 'warning')}
                  <div style={valueStyle}>
                    ¥
                    {Number(
                      rewardSummary.affiliate?.total_reward_cny || 0,
                    ).toFixed(2)}
                  </div>
                </div>
              </div>
              <div style={{ ...rowStyle, marginBottom: 0 }}>
                <div style={colStyle}>
                  {renderLabel(t('累计净充值'), 'primary')}
                  <div style={valueStyle}>
                    ¥
                    {Number(
                      rewardSummary.recharge?.total_recharge_cny || 0,
                    ).toFixed(2)}
                  </div>
                </div>
                <div style={colStyle}>
                  {renderLabel(t('充能已发放'), 'success')}
                  <div style={valueStyle}>
                    {renderNumber(rewardSummary.recharge?.granted_count || 0)}
                  </div>
                </div>
                <div style={colStyle}>
                  {renderLabel(t('充能待审核'), 'warning')}
                  <div style={valueStyle}>
                    {renderNumber(rewardSummary.recharge?.pending_count || 0)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 备注 */}
          {userInfoData.remark && (
            <div style={{ marginBottom: 0 }}>
              {renderLabel(t('备注'), 'tertiary')}
              <div
                style={{
                  ...valueStyle,
                  wordBreak: 'break-all',
                  lineHeight: '1.4',
                }}
              >
                {userInfoData.remark}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default UserInfoModal;
