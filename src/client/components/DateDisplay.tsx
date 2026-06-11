import { Text } from "@chakra-ui/react"
import dayjs, {Dayjs} from 'dayjs';
import { shortTodayAwareFormat } from "../../core/TimeUtils";
import { ComponentProps } from "react"

export type DateDisplayProps = {
    date?: string | Dayjs
    prefix?: string
} & ComponentProps<typeof Text>
export const ShortDateDisplay = (props: DateDisplayProps) => {
    const {
        date,
        prefix,
        ...rest
    } = props;
    if(date === undefined) {
        return <Text textStyle="xs" color="fg.muted" {...rest}>(No Date)</Text>
    }
    return <Text textStyle="xs" color="fg.muted" {...rest}>{`${prefix !== undefined ? `${prefix} ` : ''}${shortTodayAwareFormat(typeof date === 'string' ? dayjs(date) : date)}`}</Text>
}