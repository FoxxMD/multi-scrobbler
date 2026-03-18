import { useMemo } from 'react';
import { Clipboard, IconButton } from "@chakra-ui/react"
import {safeStringify} from '../../core/StringUtils';


export const ChakraClip = (props: {value: any}) => {
    const clipVal = useMemo(() => {
        if(typeof props.value === 'string') {
            return props.value;
        }
        return safeStringify(props.value);
    },[props.value])
  return (
    <Clipboard.Root value={clipVal}>
      <Clipboard.Trigger asChild>
        <IconButton variant="surface" size="xs">
          <Clipboard.Indicator />
        </IconButton>
      </Clipboard.Trigger>
    </Clipboard.Root>
  )
}