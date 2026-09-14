import {
  Group,
  Box,
  Burger,
  Text,
  Avatar,
  Menu,
  UnstyledButton,
  rem,
} from '@mantine/core'
import {
  IconUser,
  IconLogout,
} from '@tabler/icons-react'
import { useAuthStore } from '../../store/authStore'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import '../../pages/DigitalPioneer.css'
import { AwardBrand } from './AwardBrand'
import { Sidebar } from './Sidebar'

interface HeaderProps {
  opened: boolean
  toggle: () => void
}

export function Header({ opened, toggle }: HeaderProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { language, t } = useLanguage()

  const roleLabel = !user
    ? ''
    : user.role === 'admin'
    ? t('dashboard.administrator')
    : user.role === 'manager'
      ? (language === 'zh' ? '评选管理者' : 'Award manager')
      : t('dashboard.participant')

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      navigate('/', { replace: true })
    }
  }

  return (
    <Group h="100%" px={{ base: 12, sm: 'md' }} justify="space-between" wrap="nowrap" gap={8}>
      <Group className="dp-header-leading" gap={8}>
        <Burger opened={opened} onClick={toggle} className="dp-navigation-toggle" size="sm" aria-label={language === 'zh' ? '切换导航菜单' : 'Toggle navigation'} />
        <AwardBrand />
      </Group>

      <Box className="dp-header-navigation"><Sidebar horizontal /></Box>

      <Group className="dp-header-actions" gap={8}>
        <Menu shadow="md" zIndex={350} width={200}>
          <Menu.Target>
            <UnstyledButton className="dp-user-button" aria-label={user?.name || t('header.account')}>
              <Group gap="sm">
                <Avatar
                  src={user?.avatar}
                  alt={user?.name}
                  radius="xl"
                  size="sm"
                />
                <div className="dp-header-user-copy" style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {user?.name}
                  </Text>
                </div>
              </Group>
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Label>{roleLabel || t('header.account')}</Menu.Label>
            <Menu.Item
              leftSection={<IconUser style={{ width: rem(14), height: rem(14) }} />}
              onClick={() => navigate('/profile')}
            >
              {t('header.profile')}
            </Menu.Item>
            {user && <Menu.Item onClick={() => navigate('/projects?view=voting-records')}>My voting records</Menu.Item>}
            <Menu.Divider />

            <Menu.Item
              color="red"
              leftSection={<IconLogout style={{ width: rem(14), height: rem(14) }} />}
              onClick={handleLogout}
            >
              {t('header.logout')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  )
}
