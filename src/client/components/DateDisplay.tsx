import { Text } from "@chakra-ui/react"
import dayjs, {Dayjs} from 'dayjs';
import { shortTodayAwareFormat } from "../../core/TimeUtils";

export interface DateDisplayProps {
    date?: string | Dayjs
    prefix?: string
}
export const ShortDateDisplay = (props: DateDisplayProps) => {
    if(props.date === undefined) {
        return <Text textStyle="xs" color="fg.muted">(No Date)</Text>
    }
    return <Text textStyle="xs" color="fg.muted">{`${props.prefix !== undefined ? `${props.prefix} ` : ''}${shortTodayAwareFormat(typeof props.date === 'string' ? dayjs(props.date) : props.date)}`}</Text>
}