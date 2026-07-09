import { Button } from '@chakra-ui/react';
import { type ComponentProps, useState } from "react";

interface ToggleButtonProps {
    value?: boolean
    initialValue?: boolean
    onChange?: (val: boolean) => void
}

const noop = (_) => null;

export const ToggleButtonVariant = (props: ToggleButtonProps & ComponentProps<typeof Button>) => {

    const {
        value: propVal,
        initialValue = false,
        onChange = noop,
        children,
        variant,
        ...rest
    } = props;

    const [value, setValue] = useState(propVal ?? initialValue);

    return <Button variant={value ? 'surface' : 'outline'} onClick={() => setValue(!value)} {...rest}>{children}</Button>;
}