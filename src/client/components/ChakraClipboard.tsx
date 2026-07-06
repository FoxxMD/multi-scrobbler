import { ComponentProps, useMemo, useCallback, useEffect, useState } from 'react';
import { Clipboard, IconButton, useClipboard } from "@chakra-ui/react"
import {safeStringify} from '../../core/StringUtils';
import { CheckIcon, CopyIcon } from './icons/ChakraIcons';


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

const createCopyVal = (value: any) => {
        if(typeof value === 'string') {
            return value;
        }
        return safeStringify(value);
}


/**
 * Copies value from onCopy only when clicked 
 */
export const ChakraClipDynamic = (props: Omit<ComponentProps<typeof Clipboard.Root>, 'children' | 'value'> & {onCopy: () => any}) => {
  const {
    onCopy,
    ...rest
  } = props;

  // idk what's going on here exactly but just using clip.setValue does not set clipboard, it requires two clicks to get actual value
  // so instead using some useState abuse to re-render component and wait to copy until everything matches
  // probably related to this https://github.com/chakra-ui/chakra-ui/issues/6759

    const [clipVal, setClipVal] = useState<string | undefined>();
    const clip = useClipboard({timeout: 1000});

    useEffect(() => {
      if(clipVal !== undefined && clip.value === clipVal) {
        //console.log('run copy');
        clip.copy();
        setClipVal(undefined);
      }
    },[clip.value, clipVal, setClipVal]);
    const invokeCopy = useCallback(() => {
      const val = createCopyVal(onCopy());
      //console.log(val);
      setClipVal(val);
      clip.setValue(val);
    },[onCopy, clip.setValue]);
  return (
    <IconButton variant="surface" size="xs" onClick={invokeCopy}>
      {!clip.copied ? <CopyIcon/> : <CheckIcon/>}
    </IconButton>
  )
}