import { ComponentProps, useMemo } from 'react';
import { Clipboard, IconButton } from "@chakra-ui/react"
import {safeStringify} from '../../core/StringUtils';


export const ChakraClip = (props: Omit<ComponentProps<typeof Clipboard.Root>, 'children' | 'value'> & {value: any}) => {
  const {
    value,
    ...rest
  } = props;
    const clipVal = useMemo(() => {
        if(typeof value === 'string') {
            return value;
        }
        return safeStringify(value);
    },[value])
  return (
    <Clipboard.Root value={clipVal} {...rest}>
      <Clipboard.Trigger asChild>
        <IconButton variant="surface" size="xs">
          <Clipboard.Indicator />
        </IconButton>
      </Clipboard.Trigger>
    </Clipboard.Root>
  )
}