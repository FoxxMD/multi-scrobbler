import { Text as ChakraText } from "@chakra-ui/react"
import { ComponentProps } from "react"

export const TextMuted = (props: ComponentProps<typeof ChakraText>) => {
    const {
        children,
        ...rest
    } = props;
    return <ChakraText textStyle="xs" color="fg.muted" {...rest}>{props.children}
    </ChakraText>
}