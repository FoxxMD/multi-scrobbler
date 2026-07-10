import { HStack, IconButton } from "@chakra-ui/react";
import type {ComponentProps} from "react";
import { FaRegSquareMinus, FaRegSquarePlus } from "react-icons/fa6";

export interface ExpandCollapseProps {
    onClick: (val: boolean) => void,
    size?: string
}

export const ExpandCollapse = (props: ExpandCollapseProps & ComponentProps<typeof HStack>) => {
    const {
        onClick,
        ...rest
    } = props;

    return (
        <HStack gap="1" {...rest}>
            <IconButton
                aria-label="Collapse All"
                variant="ghost"
                size="sm"
                style={{blockSize: '20px'}}
                onClick={() => props.onClick(false)}
            >
                <FaRegSquareMinus />
            </IconButton>
            <IconButton
                aria-label="Expand All"
                variant="ghost"
                size="sm"
                style={{blockSize: '20px'}}
                onClick={() => props.onClick(true)}
            >
                <FaRegSquarePlus />
            </IconButton>
        </HStack>
    )
}