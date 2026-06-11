import { LuChevronRight } from "react-icons/lu"
import { IconButton } from "@chakra-ui/react"
import { ComponentProps } from 'react';

export const ChevronRight = LuChevronRight;
export const ChevronRightButton = (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <ChevronRight />
    </IconButton>
);