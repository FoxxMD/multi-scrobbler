import { type ComponentProps, type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Stat, VisuallyHidden } from "@chakra-ui/react";

export interface CountUpOptions {
    /** Target number to count up to */
    value: number
    /** Animation length in ms (ease-out). Default 1400 */
    duration?: number
    /** ms to wait after scrolling into view before counting starts. Default 0 */
    delay?: number
    /** Fixed number of decimal places. Default 0 */
    decimals?: number
    /** Locale used by Intl.NumberFormat for separators. Default browser locale */
    locale?: Intl.LocalesArgument
    prefix?: ReactNode
    suffix?: ReactNode
    /** Force reduced motion (no animation, renders final value like a plain Stat.ValueText) */
    reduceMotion?: boolean
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = () => typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Drop-in replacement for Stat.ValueText that counts up from 0 to `value` the first time it is scrolled into view.
 * Subsequent `value` changes animate from the displayed number to the new value.
 * */
export const CountUpValueText = (props: CountUpOptions & Omit<ComponentProps<typeof Stat.ValueText>, 'children' | 'prefix'>) => {
    const {
        value,
        duration = 1400,
        delay = 0,
        decimals = 0,
        locale,
        prefix,
        suffix,
        reduceMotion = false,
        ...rest
    } = props;

    const reduced = reduceMotion || prefersReducedMotion();
    const ref = useRef<HTMLDListElement>(null);
    const [animValue, setAnimValue] = useState(0);
    // mirrors animValue so a new animation can start from whatever is currently displayed
    const current = useRef(0);
    // latest value, read when the initial (delayed) animation starts
    const target = useRef(value);
    // true once the stat has been scrolled into view and the initial animation began
    const started = useRef(false);
    const frame = useRef<number>(undefined);

    const format = useMemo(() => new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format, [locale, decimals]);

    // animate from the currently displayed number to `to`, cancelling any animation in progress
    const animateTo = useEffectEvent((to: number) => {
        if (frame.current !== undefined) {
            cancelAnimationFrame(frame.current);
        }
        const from = current.current;
        const start = performance.now();
        const tick = (now: number) => {
            const p = duration <= 0 ? 1 : Math.min((now - start) / duration, 1);
            current.current = p === 1 ? to : from + (to - from) * easeOutCubic(p);
            setAnimValue(current.current);
            frame.current = p < 1 ? requestAnimationFrame(tick) : undefined;
        };
        frame.current = requestAnimationFrame(tick);
    });

    // initial count up, once scrolled into view
    useEffect(() => {
        const el = ref.current;
        if (reduced || el === null) {
            return;
        }
        let timeout: ReturnType<typeof setTimeout>;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some(x => x.isIntersecting)) {
                observer.disconnect();
                timeout = setTimeout(() => {
                    started.current = true;
                    animateTo(target.current);
                }, delay);
            }
        });
        observer.observe(el);
        return () => {
            observer.disconnect();
            clearTimeout(timeout);
            if (frame.current !== undefined) {
                cancelAnimationFrame(frame.current);
            }
        };
    }, [reduced, delay]);

    // later value changes animate from the current number to the new one
    useEffect(() => {
        target.current = value;
        if (started.current && !reduced) {
            animateTo(value);
        }
    }, [value, reduced]);

    const display = reduced ? value : animValue;
    const final = <>{prefix}{format(value)}{suffix}</>;

    if (display === value) {
        return <Stat.ValueText ref={ref} {...rest}>{final}</Stat.ValueText>;
    }

    return (
        <Stat.ValueText ref={ref} fontVariantNumeric="tabular-nums" {...rest}>
            <VisuallyHidden>{final}</VisuallyHidden>
            <span aria-hidden="true">{prefix}{format(display)}{suffix}</span>
        </Stat.ValueText>
    );
}

/**
 * Stat with a label and a count-up value. For anything more custom compose Stat.Root + CountUpValueText directly.
 * */
export const CountUpStat = (props: CountUpOptions & {
    label: ReactNode
    helpText?: ReactNode
} & Omit<ComponentProps<typeof Stat.Root>, 'prefix'>) => {
    const {
        value, duration, delay, decimals, locale, prefix, suffix, reduceMotion,
        label,
        helpText,
        ...rest
    } = props;
    return (
        <Stat.Root {...rest}>
            <Stat.Label>{label}</Stat.Label>
            <CountUpValueText {...{ value, duration, delay, decimals, locale, prefix, suffix, reduceMotion }} />
            {helpText !== undefined && <Stat.HelpText>{helpText}</Stat.HelpText>}
        </Stat.Root>
    );
}
