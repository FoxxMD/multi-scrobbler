import type { FieldWithValue } from '@tanstack/react-form'
import { Checkbox, Field, RadioGroup, HStack, NumberInput, Switch } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import React from 'react';

/** Error messages for a field, render inside Field.Root */
export const FormFieldErrors = ({field}: {field: FieldWithValue<any>}) => <>{field.errors.map((error) => (
    <Field.ErrorText key={error.message}>
        {error.message}
    </Field.ErrorText>
))}</>;

export const FormCheckbox = <T extends boolean | undefined>({
  field,
  label,
  helperText,
  disabled
}: {
  field: FieldWithValue<T>
  label: string | ReactNode
  helperText?: ReactNode
  disabled?: boolean
}) => <Field.Root invalid={field.errors.length > 0} disabled={disabled}>
    <Checkbox.Root
        checked={field.value ?? false}
        onCheckedChange={(details) => field.handleChange(!!details.checked as T)}
        onBlur={field.handleBlur}
    >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
    {helperText !== undefined ? <Field.HelperText>{helperText}</Field.HelperText> : undefined}
    <FormFieldErrors field={field}/>
    </Field.Root>;

export type RadioFormItem<T = string> = { value: T, label: string | React.JSX.Element };
export const FormRadio = <T extends string = string>({
  field,
  label,
  helperText,
  items,
  disabled
}: {
  field: FieldWithValue<T>
  label: string | ReactNode
  helperText?: ReactNode
  items: RadioFormItem<T>[],
  disabled?: boolean
}) => <Field.Root invalid={field.errors.length > 0} disabled={disabled}>
    <Field.Label>{label}</Field.Label>
    {helperText !== undefined ? <Field.HelperText>{helperText}</Field.HelperText> : undefined}
    <RadioGroup.Root
      value={field.value}
      // values only ever come from items
      onValueChange={(details) => details.value !== null && field.handleChange(details.value as T)}
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
    <FormFieldErrors field={field}/>
  </Field.Root>;

export const FormSwitch = <T extends boolean | undefined>({
  field,
  label,
  helperText,
  disabled
}: {
  field: FieldWithValue<T>
  label: string | ReactNode
  helperText?: ReactNode
  disabled?: boolean
}) => <Field.Root invalid={field.errors.length > 0} disabled={disabled}>
    <Switch.Root
      checked={field.value ?? false}
      onCheckedChange={(details) => field.handleChange(details.checked as T)}
      onBlur={field.handleBlur}
    >
      <Switch.HiddenInput />
      <Switch.Control />
      <Switch.Label>{label}</Switch.Label>
    </Switch.Root>
    {helperText !== undefined ? <Field.HelperText>{helperText}</Field.HelperText> : undefined}
    <FormFieldErrors field={field}/>
  </Field.Root>;

/** Number input for a number field. An emptied input sets the value to `empty` (default 0) so the field is never NaN */
export const FormNumberInput = ({
  field,
  label,
  helperText,
  disabled,
  min,
  max,
  step,
  empty = 0,
  ...rest
}: {
  field: FieldWithValue<number>
  label: string | ReactNode
  helperText?: ReactNode
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  empty?: number
} & Omit<NumberInput.RootProps, 'value' | 'onValueChange' | 'min' | 'max' | 'step' | 'disabled'>) => <Field.Root invalid={field.errors.length > 0} disabled={disabled}>
    <Field.Label>{label}</Field.Label>
    <NumberInput.Root
      {...rest}
      value={String(field.value)}
      min={min}
      max={max}
      step={step}
      onValueChange={(details) => field.handleChange(Number.isNaN(details.valueAsNumber) ? empty : details.valueAsNumber)}
      onBlur={field.handleBlur}
    >
      <NumberInput.Control />
      <NumberInput.Input />
    </NumberInput.Root>
    {helperText !== undefined ? <Field.HelperText>{helperText}</Field.HelperText> : undefined}
    <FormFieldErrors field={field}/>
  </Field.Root>;