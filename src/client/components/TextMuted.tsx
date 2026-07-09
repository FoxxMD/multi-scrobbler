import { Text as ChakraText, Span } from "@chakra-ui/react"
import { type ComponentProps } from "react"

export const TextMuted = (props: ComponentProps<typeof ChakraText>) => {
    const {
        children,
        ...rest
    } = props;
    return <Span textStyle="xs" color="fg.muted" {...rest}>{props.children}
    </Span>
}