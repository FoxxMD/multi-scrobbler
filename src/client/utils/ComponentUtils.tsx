import { Card, HTMLChakraProps } from '@chakra-ui/react';

export const cardHeaderSeparator: Card.HeaderProps = {
    borderBottomWidth: "1px",
    paddingBottom: "2"
};

export const timelineTextFormatting: HTMLChakraProps<"span"> = {
    textAlign: "left",
    textWrap: "balance" 
}