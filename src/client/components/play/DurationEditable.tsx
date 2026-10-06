import { HStack, NumberInput, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
import { useId, useState } from "react";
import { durationToNormalizedTime } from "../../../core/TimeUtils.js";

dayjs.extend(duration);

const formatOptions: Intl.NumberFormatOptions = { useGrouping: false };

export interface DurationEditableProps extends Omit<NumberInput.RootProps, 'value' | 'defaultValue' | 'onChange' | 'onValueChange'> {
    /** Initial duration, in seconds */
    seconds?: number
    onChange?: (seconds: number) => void
}

const units = [
    { name: 'hours', label: 'hr', size: 3600 },
    { name: 'minutes', label: 'min', size: 60 },
    { name: 'seconds', label: 'sec', size: 1 },
] as const;

/**
 * Duration in seconds, edited as separate hour/minute/second number inputs.
 *
 * Minutes and seconds carry over into the next unit when they go past 59 or below 0.
 */
export const DurationSepEditable = (props: DurationEditableProps) => {
    const {
        seconds = 0,
        onChange,
        ...rest
    } = props;

    const [total, setTotal] = useState(() => Math.max(0, Math.round(seconds)));
    // raw text of the input being typed in, so it is not reformatted (EX cleared input snapping back to 0) mid-edit
    const [editing, setEditing] = useState<{ name: string, text: string } | null>(null);

    const parts = durationToNormalizedTime(dayjs.duration(total, 'seconds'));
    const id = useId();
    return (
        <HStack>
            {units.map(({ name, label, size }) => (
                <HStack key={name} gap="1">
                    <NumberInput.Root
                        width="20"
                        formatOptions={formatOptions}
                        {...rest}
                        // inside a Field all inputs would inherit the same id from Field context, making each NumberInput write its value to the first (hours) input
                        // -- hours keeps the Field id so Field.Label still targets it
                        {...(name === 'hours' ? {} : { ids: { input: `${id}-${name}` } })}
                        // allow stepping below 0 only when there is a larger unit to borrow from
                        min={Math.floor(total / size) > parts[name] ? -1 : 0}
                        value={editing?.name === name ? editing.text : String(parts[name])}
                        onValueChange={(details) => {
                            // empty input counts as 0
                            const val = Number.isNaN(details.valueAsNumber) ? 0 : details.valueAsNumber;
                            const carries = val < 0 || (name !== 'hours' && val > 59);
                            setEditing(carries ? null : { name, text: details.value });

                            const next = Math.max(0, total + ((val - parts[name]) * size));
                            if (next !== total) {
                                setTotal(next);
                                onChange?.(next);
                            }
                        }}
                        onFocusChange={(details) => {
                            if (!details.focused) {
                                setEditing(null);
                            }
                        }}
                    >
                        <NumberInput.Control />
                        <NumberInput.Input aria-label={name} />
                    </NumberInput.Root>
                    <Text textStyle="sm" color="fg.muted">{label}</Text>
                </HStack>
            ))}
        </HStack>
    );
}
