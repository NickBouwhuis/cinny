import React, { MouseEventHandler, useState } from 'react';
import {
  Avatar,
  Box,
  Icon,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  config,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { SidebarItem, SidebarItemTooltip, SidebarAvatar } from '../../../components/sidebar';
import { UserAvatar } from '../../../components/user-avatar';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { Settings } from '../../../features/settings';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { Modal500 } from '../../../components/Modal500';
import { stopPropagation } from '../../../utils/keyboard';
import { getSessions, setAddingAccount } from '../../../state/sessions';
import { switchAccount } from '../../../../client/initMatrix';
import { useClientConfig } from '../../../hooks/useClientConfig';
import { getLoginPath, getOriginBaseUrl, withOriginBaseUrl } from '../../pathUtils';
import { deleteAfterLoginRedirectPath } from '../../afterLoginRedirectPath';

type AccountMenuProps = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  onOpenSettings: () => void;
  requestClose: () => void;
};
function AccountMenu({
  userId,
  displayName,
  avatarUrl,
  onOpenSettings,
  requestClose,
}: AccountMenuProps) {
  const { hashRouter } = useClientConfig();
  const otherSessions = getSessions().filter((session) => session.userId !== userId);

  const handleAddAccount = () => {
    setAddingAccount(true);
    deleteAfterLoginRedirectPath();
    // full page load so the current client is torn down
    window.location.assign(withOriginBaseUrl(getOriginBaseUrl(hashRouter), getLoginPath()));
  };

  return (
    <Menu style={{ maxWidth: toRem(260), width: '100vw' }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <Box gap="200" alignItems="Center" style={{ padding: config.space.S200 }}>
          <Avatar size="300">
            <UserAvatar
              userId={userId}
              src={avatarUrl}
              renderFallback={() => <Text size="H6">{nameInitials(displayName)}</Text>}
            />
          </Avatar>
          <Box grow="Yes" direction="Column">
            <Text size="T300" truncate>
              <b>{displayName}</b>
            </Text>
            <Text size="T200" priority="300" truncate>
              {userId}
            </Text>
          </Box>
          <Icon size="100" src={Icons.Check} />
        </Box>
        <MenuItem
          size="300"
          radii="300"
          before={<Icon size="100" src={Icons.Setting} />}
          onClick={() => {
            onOpenSettings();
            requestClose();
          }}
        >
          <Text as="span" size="T300" truncate>
            Settings
          </Text>
        </MenuItem>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {otherSessions.map((session) => (
          <MenuItem
            key={session.userId}
            size="400"
            radii="300"
            before={
              <Avatar size="200">
                <UserAvatar
                  userId={session.userId}
                  renderFallback={() => (
                    <Text size="H6">
                      {nameInitials(getMxIdLocalPart(session.userId) ?? session.userId)}
                    </Text>
                  )}
                />
              </Avatar>
            }
            onClick={() => switchAccount(session.userId)}
          >
            <Text as="span" size="T300" truncate>
              {session.userId}
            </Text>
          </MenuItem>
        ))}
        <MenuItem
          size="300"
          radii="300"
          before={<Icon size="100" src={Icons.Plus} />}
          onClick={handleAddAccount}
        >
          <Text as="span" size="T300" truncate>
            Add Account
          </Text>
        </MenuItem>
      </Box>
    </Menu>
  );
}

export function SettingsTab() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);

  const [settings, setSettings] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const openSettings = () => setSettings(true);
  const closeSettings = () => setSettings(false);

  const handleToggleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => (currentState ? undefined : cords));
  };

  return (
    <SidebarItem active={settings || !!menuAnchor}>
      <SidebarItemTooltip tooltip="Account">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} onClick={handleToggleMenu}>
            <UserAvatar
              userId={userId}
              src={avatarUrl}
              renderFallback={() => <Text size="H4">{nameInitials(displayName)}</Text>}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {menuAnchor && (
        <PopOut
          anchor={menuAnchor}
          position="Right"
          align="End"
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                returnFocusOnDeactivate: false,
                onDeactivate: () => setMenuAnchor(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <AccountMenu
                userId={userId}
                displayName={displayName}
                avatarUrl={avatarUrl}
                onOpenSettings={openSettings}
                requestClose={() => setMenuAnchor(undefined)}
              />
            </FocusTrap>
          }
        />
      )}
      {settings && (
        <Modal500 requestClose={closeSettings}>
          <Settings requestClose={closeSettings} />
        </Modal500>
      )}
    </SidebarItem>
  );
}
