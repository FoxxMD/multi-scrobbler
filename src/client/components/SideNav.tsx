import {
  Stack,
  HStack,
  Link,
  type LinkProps,
  type StackProps,
  type BadgeProps,
  Badge
} from "@chakra-ui/react"
import { Link as RouterLink } from "react-router";
import { ExternalLinkIconRaw } from "./icons/ChakraIcons"
import { useHasAccess } from "../auth/authClient";

interface SideNavItemProp {
  title: string
  url: LinkProps["href"] | undefined
  external?: boolean
  status?: string
  authed?: boolean
}

interface SideNavProps {
  currentUrl?: string
  title: string
  id: string
  status?: string
  items: Array<SideNavItemProp>
}


const SideNavItem = (props: StackProps) => {
  return (
    <HStack
      py="1.5"
      ps="4"
      pe="3"
      rounded="sm"
      color="fg.muted"
      _hover={{
        layerStyle: "fill.subtle",
      }}
      _currentPage={{
        //colorPalette: "teal",
        fontWeight: "medium",
        layerStyle: "fill.subtle",
      }}
      {...props}
    />
  )
}

export const SideNav = (props: SideNavProps) => {
  const { title, items, currentUrl, status } = props
  const {hasAccess} = useHasAccess();
  return (
    <Stack gap="2">
      {title && (
        <HStack ps="4" fontWeight="semibold">
          {title}
          {status && <StatusBadge>{status}</StatusBadge>}
        </HStack>
      )}
      <Stack gap="1px">
        {items.map((item, index) => {
          if(item.authed !== undefined) {
            if(item.authed && !hasAccess) {
              return undefined;
            }
            if(!item.authed && hasAccess) {
              return undefined;
            }
          }
          return (
          <SideNavItem key={index} asChild>
            {item.external ? (
              <Link
                href={item.url as string}
                target="_blank"
                rel="noopener"
                aria-current={item.url === currentUrl ? "page" : undefined}
              >
                {item.title}
                <ExternalLinkIconRaw />
                {item.status && <StatusBadge>{item.status}</StatusBadge>}
              </Link>
            ) : (
              <RouterLink
                to={{pathname: item.url}}
                aria-current={(currentUrl !== undefined && item.url !== undefined && (currentUrl.length <= item.url.length ? currentUrl.startsWith(item.url) : currentUrl === item.url)) ? "page" : undefined}
              >
                {item.title}
                {item.status && <StatusBadge>{item.status}</StatusBadge>}
              </RouterLink>
            )}
          </SideNavItem>
        )}).filter(x => x !== undefined)}
      </Stack>
    </Stack>
  )
}

export const SideNavItems = (props: {items: SideNavProps[], currentUrl?: string}) => {
    return (<>
    {props.items.map((x) => <SideNav key={x.id} currentUrl={props.currentUrl} {...x}/>)}
    </>)
}

const StatusBadge = (props: BadgeProps) => (
  <Badge
    size="xs"
    textStyle="xs"
    variant="solid"
    colorPalette="teal"
    textTransform="capitalize"
    {...props}
  />
)

export const EXTERNAL_LINKS: SideNavProps = {
        title: 'Links',
        id: 'Links',
        items: [
            {
                title: 'Services Monitor',
                url: 'https://status.multi-scrobbler.app',
                external: true
            },
            {
                title: 'Docs (Latest)',
                url: 'https://docs.multi-scrobbler.app/',
                external: true
            },
            {
                title: 'Docs (Self-Hosted)',
                // backend serves docs at <basePath>/docs, basePath is '/' or '/subpath' (no trailing slash)
                url: `${(window.__MS_RUNTIME__?.basePath ?? '/').replace(/\/$/, '')}/docs`,
                external: true
            },
            {
                title: 'Code',
                url: 'https://github.com/FoxxMD/multi-scrobbler',
                external: true
            }
        ]
}

export const NAV_LINKS: SideNavProps[] = [
    {
        title: 'Main',
        id: 'Main',
        items: [
            {
                title: 'Dashboard',
                url: '/'
            }
        ]
    },
    {
      title: 'Account',
      id: 'account',
      items: [
        {
          title: 'Settings',
          url: '/settings',
          authed: true
        },
        {
          title: 'Log Out',
          url: '/logout',
          authed: true
        },
        {
          title: 'Log In',
          url: '/login',
          authed: false
        }
      ]
    },
    EXTERNAL_LINKS
];