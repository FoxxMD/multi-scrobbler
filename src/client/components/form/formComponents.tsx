import type { FieldWithValue } from '@tanstack/react-form'
import { Checkbox, Field } from '@chakra-ui/react';
import type { ReactNode } from 'react';

export const FormCheckbox = ({
  field,
  label,
  disabled
}: {
  field: FieldWithValue<boolean>
  label: string | ReactNode
  disabled?: boolean
}) => <Field.Root invalid={field.errors.length > 0} disabled={disabled}>
    <Checkbox.Root
        checked={field.value}
        onCheckedChange={(details) => field.handleChange(!!details.checked)}
        onBlur={field.handleBlur}
    >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
    {field.errors.map((error) => (
        <Field.ErrorText key={error.message}>
          {error.message}
        </Field.ErrorText>
      ))}      
    </Field.Root>;