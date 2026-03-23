import { Span } from '@chakra-ui/react';
import { ComponentProps } from 'react';

export const Muted = (props: ComponentProps<typeof Span> = {}) => <Span color="fg.muted" {...props}></Span>