import {
  SquareTerminal,
  ServerIcon,
  MonitorSmartphoneIcon,
  ChartNetworkIcon,
  Scroll,
  Cable,
  SquareFunction,
  Network,
  ShieldCheck,
} from "lucide-react"
import { TbBuildingTunnel } from "react-icons/tb"
import { ROUTES } from "@/lib/routes"

export const teams = [
  {
    name: "Frp-Panel",
    logo: TbBuildingTunnel,
    plan: "Community Edition",
    url: "/",
  },
]

export const getNavItems = (t: any, role?: string) => [
  {
    title: t('nav.clients'),
    url: "/clients",
    icon: MonitorSmartphoneIcon,
    isActive: true,
  },
  {
    title: t('nav.servers'),
    url: "/servers",
    icon: ServerIcon,
  },
  {
    title: t('nav.editTunnel'),
    url: "/proxies",
    icon: Cable,
  },
  // {
  //   title: t('nav.editClient'),
  //   url: "/clientedit",
  //   icon: MonitorCogIcon,
  // },
  // {
  //   title: t('nav.editServer'),
  //   url: "/serveredit",
  //   icon: ServerCogIcon,
  // },
  {
    title: t('nav.trafficStats'),
    url: "/clientstats",
    icon: ChartNetworkIcon,
  },
  {
    title: t('nav.realTimeLog'),
    url: "/streamlog",
    icon: Scroll,
  },
  ...(role === 'admin' ? [{
    title: t('nav.console'),
    url: "/console",
    icon: SquareTerminal,
  }] : []),
  {
    title: t('nav.workers'),
    url: ROUTES.workers,
    icon: SquareFunction,
  },
  {
    title: t('wg.nav.section'),
    url: ROUTES.wg.networks,
    icon: Network,
    items: [
      {
        title: t('wg.nav.networks'),
        url: ROUTES.wg.networks,
      },
      {
        title: t('wg.nav.wireguards'),
        url: ROUTES.wg.wireguards,
      },
      {
        title: t('wg.nav.endpoints'),
        url: ROUTES.wg.endpoints,
      },
      {
        title: t('wg.nav.links'),
        url: ROUTES.wg.links,
      },
    ],
  },
  ...(role === 'admin' ? [{
    title: '权限管理',
    url: "/admin-permissions",
    icon: ShieldCheck,
  }] : []),
]
