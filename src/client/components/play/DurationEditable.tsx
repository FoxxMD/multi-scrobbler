import { HStack, IconButton, NumberInput, Text, useBreakpointValue, Box } from "@chakra-ui/react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js";
import { useId, useState } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
import { durationToNormalizedTime } from "../../../core/TimeUtils.js";

dayjs.extend(duration);

const formatOptions: Intl.NumberFormatOptions = { useGrouping: false };

export interface DurationEditableProps extends Omit<NumberInput.RootProps, 'value' | 'defaultValue' | 'onChange' | 'onValueChange'> {
    /** Duration in seconds. Inputs update whenever this changes */
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
 *
 * At the sm breakpoint and below each input is replaced with a touch-friendly stepper (value with -/+ buttons).
 */
export const DurationSepEditable = (props: DurationEditableProps) => {
    const {
        seconds = 0,
        onChange,
        ...rest
    } = props;

    const toTotal = (val: number) => Math.max(0, Math.round(val));

    const [total, setTotal] = useState(() => toTotal(seconds));
    // raw text of the input being typed in, so it is not reformatted (EX cleared input snapping back to 0) mid-edit
    const [editing, setEditing] = useState<{ name: string, text: string } | null>(null);


    // follow seconds prop when it is changed from outside (form reset, value set programmatically)
    // this is compared against total so the echo of our own onChange does not discard what the user is typing
    const [prevSeconds, setPrevSeconds] = useState(seconds);
    if (seconds !== prevSeconds) {
        setPrevSeconds(seconds);
        if (toTotal(seconds) !== total) {
            setTotal(toTotal(seconds));
            setEditing(null);
        }
    }

    const parts = durationToNormalizedTime(dayjs.duration(total, 'seconds'));
    const id = useId();
    const mobile = useBreakpointValue({ base: true, md: false }, { fallback: 'md' });

    return (
        <HStack wrap="wrap" gapX={{mdDown:"4", mdTo2xl: "1"}}>
            {units.map(({ name, label, size }) => (
                <HStack key={name} gap="1">
                    <NumberInput.Root
                        width={mobile ? undefined : '20'}
                        formatOptions={formatOptions}
                        {...rest}
                        unstyled={mobile}
                        // inside a Field all inputs would inherit the same id from Field context, making each NumberInput write its value to the first (hours) input.
                        // hours keeps the Field id so Field.Label still targets it
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
                        {mobile ? (
                            <HStack gap="2">
                                <NumberInput.DecrementTrigger asChild>
                                    <IconButton variant="outline" size="sm">
                                        <LuMinus />
                                    </IconButton>
                                </NumberInput.DecrementTrigger>
                                <NumberInput.ValueText textAlign="center" fontSize="lg" minW="2ch" />
                                <NumberInput.IncrementTrigger asChild>
                                    <IconButton variant="outline" size="sm">
                                        <LuPlus />
                                    </IconButton>
                                </NumberInput.IncrementTrigger>
                            </HStack>
                        ) : (
                            <>
                                <NumberInput.Control />
                                <NumberInput.Input aria-label={name} />
                            </>
                        )}
                    </NumberInput.Root>
                    <Text textStyle="sm" color="fg.muted">{label}</Text>
                </HStack>
            ))}
        </HStack>
    );
}
