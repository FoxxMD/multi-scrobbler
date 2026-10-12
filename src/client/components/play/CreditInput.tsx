import { Field, HStack, Input, InputGroup, Stack } from "@chakra-ui/react";
import type { FieldWithValue } from "@tanstack/react-form";
import { useState, type ReactNode } from "react";
import type { Credit, MusicServices } from "../../../core/Atomic"
import { LettersButton, PlusButton, SearchButton, SearchIcon } from "../icons/ChakraIcons";
import { MusicServiceInput } from "../musicServices/MusicServiceEditable";
import { MusicServiceIndicator } from "../musicServices/MusicServiceIndicators";
import { Tooltip } from "../ToggleTip";

export interface CreditInputProps {
    /** Controlled, omit for a new, blank credit */
    value?: Credit
    onChange: (val: Credit) => void
    onBlur?: () => void
    onInputSwitch?: () =>  void
    placeholder?: string
    /** Limits the music service types that can be chosen EX ['track'] */
    useWith?: string[]
}

export const CreditInput = (props: CreditInputProps) => {
    const {
        value = { name: '' },
        onChange,
        onBlur,
        onInputSwitch,
        placeholder,
        useWith
    } = props;
    const metadata = value.metadata ?? [];

    const [adding, setAdding] = useState<boolean>(false);

    /** Add a service, or replace the one at `index`. Any other service with the same name + idType is removed, same as `withMetadata` */
    const setService = (service: MusicServices, index: number = metadata.length) => {
        const next = [...metadata];
        // MusicServiceInput only edits name/idType/id, keep the rest (image) of an edited service
        next[index] = { ...metadata[index], ...service } as MusicServices;
        onChange({ ...value, metadata: next.filter((x, i) => i === index || x.name !== service.name || x.idType !== service.idType) });
    };

    let inputSwitch: React.JSX.Element | undefined = undefined;
    if(onInputSwitch !== undefined) {
        inputSwitch = <Tooltip content="Click to switch to search mode."><LettersButton variant="ghost" size="xs" onClick={() => onInputSwitch()}/></Tooltip>
    }

    return (
        <Stack width="100%" gap="2">
            <InputGroup endElement={inputSwitch}>
                <Input
                    value={value.name}
                    placeholder={placeholder}
                    onBlur={onBlur}
                    onChange={(e) => onChange({ ...value, name: e.currentTarget.value })} />
            </InputGroup>
            <HStack wrap="wrap" alignItems="normal">
                {metadata.map((x, i) => (
                    <MusicServiceIndicator
                        // not index, each indicator has its own editing state that must not move to a sibling on remove
                        key={`${x.name}-${x.idType ?? ''}-${x.id}`}
                        editable
                        data={x}
                        useWith={useWith}
                        onChange={(val) => setService(val, i)}
                        onRemove={() => onChange({ ...value, metadata: metadata.filter((_, j) => j !== i) })} />
                ))}
                {adding ? (
                    <MusicServiceInput
                        useWith={useWith}
                        onSubmit={(val) => {
                            setService(val);
                            setAdding(false);
                        }}
                        onCancel={() => setAdding(false)} />
                ) : <PlusButton aria-label="Add ID" variant="outline" onClick={() => setAdding(true)} />}
            </HStack>
        </Stack>
    );
}

/** `CreditInput` bound to a form field. Schema issues are reported on descendants (.name) so the field needs `errorBoundary` to show them here */
export const FormCreditInput = ({
    field,
    label,
    ...rest
}: {
    // field types are invariant, the union accepts both required (track, artists) and optional (album) credits
    field: FieldWithValue<Credit> | FieldWithValue<Credit | undefined>
    label?: string | ReactNode
} & Pick<CreditInputProps, 'placeholder' | 'useWith'>) => <Field.Root invalid={field.errors.length > 0}>
        {label !== undefined ? <Field.Label>{label}</Field.Label> : undefined}
        <CreditInput
            value={field.value}
            onChange={(val) => field.handleChange(val)}
            onBlur={field.handleBlur}
            {...rest} />
        {field.errors.map((error) => (
            <Field.ErrorText key={error.message}>
                {error.message}
            </Field.ErrorText>
        ))}
    </Field.Root>;
