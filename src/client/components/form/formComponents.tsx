import type { FieldWithValue } from '@tanstack/react-form'
import { Checkbox, Field, RadioGroup, HStack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import React from 'react';

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

export type RadioFormItem<T = string> = { value: T, label: string | React.JSX.Element };
export const FormRadio = ({
  field,
  label,
  items,
  disabled
}: {
  field: FieldWithValue<string>
  label: string | ReactNode
  items: RadioFormItem[],
  disabled?: boolean
}) => <Field.Root invalid={field.errors.length > 0} disabled={disabled}>
    <Field.Label>{label}</Field.Label>
    <RadioGroup.Root
      value={field.value}
      onValueChange={(details) => field.handleChange(details.value)}
      onBlur={field.handleBlur}
    >
      <HStack gap="6">
        {items.map((item) => (
          <RadioGroup.Item key={item.value} value={item.value}>
            <RadioGroup.ItemHiddenInput />
            <RadioGroup.ItemIndicator />
            <RadioGroup.ItemText>{item.label}</RadioGroup.ItemText>
          </RadioGroup.Item>
        ))}
      </HStack>
    </RadioGroup.Root>
    {field.errors.map((error) => (
      <Field.ErrorText key={error.message}>
        {error.message}
      </Field.ErrorText>
    ))}
  </Field.Root>;