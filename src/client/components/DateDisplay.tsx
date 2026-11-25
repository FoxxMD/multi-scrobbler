import { Text } from "@chakra-ui/react"
import type {Dayjs} from 'dayjs';
import dayjs from 'dayjs';
import { isoToHuman, shortTodayAwareFormat } from "../utils/index";
import type {ComponentProps} from "react";

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

/** Date with year, in the user's date format. EX 01/01/1970 12:00:41 AM */
export const FullDateDisplay = (props: DateDisplayProps & { utc?: boolean }) => {
    const {
        date,
        prefix,
        utc,
        ...rest
    } = props;
    if(date === undefined) {
        return <Text textStyle="xs" color="fg.muted" {...rest}>(No Date)</Text>
    }
    return <Text textStyle="xs" color="fg.muted" {...rest}>{`${prefix !== undefined ? `${prefix} ` : ''}${isoToHuman(typeof date === 'string' ? date : date.toISOString(), {includeDate: true, utc})}`}</Text>
}
