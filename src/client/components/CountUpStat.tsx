import { type ComponentProps, type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Stat, VisuallyHidden } from "@chakra-ui/react";
import { type NumberFormatOpts, useNumberFormatter } from "./AbbreviatedNumber.js";

export interface CountUpOptions extends NumberFormatOpts {
    /** Target number to count up to */
    value: number
    /** Animation length in ms (ease-out). Default 1400 */
    duration?: number
    /** ms to wait after scrolling into view before counting starts. Default 0 */
    delay?: number
    prefix?: ReactNode
    suffix?: ReactNode
    /** Custom number formatting, used for every animation frame. Overrides `decimals`, `locale` and `abbreviate` */
    formatter?: (num: number) => ReactNode
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
        decimals,
        locale,
        abbreviate,
        prefix,
        suffix,
        formatter,
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

    // abbreviation is applied on every animation frame so the count rolls over units (999K => 1M) naturally
    const defaultFormat = useNumberFormatter({ decimals, locale, abbreviate });
    const format = formatter ?? defaultFormat;

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

    // widest text the count passes through, reserved from the start so the layout never changes while counting (ie neighbours wrapping).
    // usually the final value, but abbreviated counts can be wider just below a unit boundary (999.99K on the way to 1.2M).
    // ponytail: checks one number per order of magnitude that fills every digit/decimal (0.987654321 * 10^k) and compares by length, fine with tabular-nums.
    // a custom formatter can return any ReactNode so only the final value is reserved for it
    const widest = useMemo(() => {
        const finalText = format(value);
        if (reduced || typeof finalText !== 'string') {
            return finalText;
        }
        let best = finalText;
        for (let p = 10; p < Math.abs(value); p *= 10) {
            const candidate = format(Math.sign(value) * p * 0.987654321);
            if (typeof candidate === 'string' && candidate.length > best.length) {
                best = candidate;
            }
        }
        return best;
    }, [format, value, reduced]);

    const display = reduced ? value : animValue;
    const final = <>{prefix}{format(value)}{suffix}</>;

    if (reduced) {
        return <Stat.ValueText ref={ref} {...rest}>{final}</Stat.ValueText>;
    }

    // same structure for the whole animation (and after), swapping it at the end could shift the width a little
    return (
        <Stat.ValueText ref={ref} fontVariantNumeric="tabular-nums" {...rest}>
            <VisuallyHidden>{final}</VisuallyHidden>
            {/* every child in the same grid cell, the invisible widest text sizes it */}
            <span aria-hidden="true" style={{display: 'inline-grid'}}>
                <span style={{gridArea: '1 / 1', visibility: 'hidden'}}>{prefix}{widest}{suffix}</span>
                <span style={{gridArea: '1 / 1'}}>{prefix}{format(display)}{suffix}</span>
            </span>
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
        value, duration, delay, decimals, locale, abbreviate, prefix, suffix, reduceMotion,
        label,
        helpText,
        ...rest
    } = props;
    return (
        <Stat.Root {...rest}>
            <Stat.Label>{label}</Stat.Label>
            <CountUpValueText {...{ value, duration, delay, decimals, locale, abbreviate, prefix, suffix, reduceMotion }} />
            {helpText !== undefined && <Stat.HelpText>{helpText}</Stat.HelpText>}
        </Stat.Root>
    );
}

