import {
  Stack,
  HStack,
  Link,
  LinkProps,
  StackProps,
  BadgeProps,
  Badge
} from "@chakra-ui/react"
import { Link as RouterLink } from "react-router";
import { ExternalLinkIcon } from "./icons/ChakraIcons"

interface SideNavItem {
  title: React.ReactNode
  url: LinkProps["href"] | undefined
  external?: boolean
  status?: string
}

interface SideNavProps {
  currentUrl?: string
  title: React.ReactNode
  id: string
  status?: string
  items: Array<SideNavItem>
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
  return (
    <Stack gap="2">
      {title && (
        <HStack ps="4" fontWeight="semibold">
          {title}
          {status && <StatusBadge>{status}</StatusBadge>}
        </HStack>
      )}
      <Stack gap="1px">
        {items.map((item, index) => (
          <SideNavItem key={index} asChild>
            {item.external ? (
              <Link
                href={item.url as string}
                target="_blank"
                rel="noopener"
                aria-current={item.url === currentUrl ? "page" : undefined}
              >
                {item.title}
                <ExternalLinkIcon />
                {item.status && <StatusBadge>{item.status}</StatusBadge>}
              </Link>
            ) : (
              <RouterLink
                href={item.url!}
                aria-current={item.url === currentUrl ? "page" : undefined}
              >
                {item.title}
                {item.status && <StatusBadge>{item.status}</StatusBadge>}
              </RouterLink>
            )}
          </SideNavItem>
        ))}
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

export const NAV_LINKS: SideNavProps[] = [
    {
        title: 'Main',
        id: 'Main',
        items: [
            {
                title: 'Dashboard',
                url: '/next/'
            }
        ]
    },
    {
        title: 'Links',
        id: 'Links',
        items: [
            {
                title: 'Services Monitor',
                url: 'https://status.multi-scrobbler.app',
                external: true
            },
            {
                title: 'Docs',
                url: 'https://docs.multi-scrobbler.app/',
                external: true
            },
            {
                title: 'Code',
                url: 'https://github.com/FoxxMD/multi-scrobbler',
                external: true
            }
        ]
    }
]