import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { SystemStyleObject } from "@chakra-ui/react";

/** hover effects only for devices that can actually hover, touch gets them from useTouchSpread */
export const finePointer = '@media (hover: hover) and (pointer: fine)';

/**
 * container css: spread children by `spread` while hovered (fine pointer)
 * or by `touchSpread` while spread by touch (wider, a finger needs a bigger target than a mouse)
 * */
export const spreadContainerCss = (spread: SystemStyleObject['spaceX'], touchSpread: SystemStyleObject['spaceX'] = spread): SystemStyleObject => ({
    [finePointer]: {_hover: {spaceX: spread}},
    '&[data-spread]': {spaceX: touchSpread},
});

/** item css: lift the hovered, active (tapped) or popover-open item above its neighbours */
export const spreadItemCss: SystemStyleObject = {
    _motionSafe: {transitionProperty: 'margin, transform', transitionDuration: 'moderate', transitionTimingFunction: 'ease-out'},
    [finePointer]: {
        _hover: {zIndex: 'docked', _motionSafe: {transform: 'translateY(-0.25rem)'}},
    },
    '&[data-active], &:has([aria-expanded=true])': {zIndex: 'docked', _motionSafe: {transform: 'translateY(-0.25rem)'}},
};

/**
 * Touch equivalent of hovering a stack.
 *
 * The first tap on a collapsed stack only spreads it (the tap does not reach the items, overlapping items are too small to aim at).
 * The stack stays spread so its items can be tapped, a tap outside the stack (or an open popover from it) collapses it.
 * Mouse and keyboard are unaffected, hover css handles them.
 *
 * Spread `containerProps` on the stack container.
 * */
export const useTouchSpread = <T extends HTMLElement>(enabled = true) => {
    const ref = useRef<T>(null);
    const pointerType = useRef<string>('mouse');
    const [spread, setSpread] = useState(false);

    useEffect(() => {
        if (!spread) {
            return;
        }
        const onDown = (e: globalThis.PointerEvent) => {
            const target = e.target as Element | null;
            // popover content is portaled outside the stack but still belongs to it
            if (target !== null && (ref.current?.contains(target) || target.closest('[data-scope="popover"][data-part="content"]') !== null)) {
                return;
            }
            setSpread(false);
        }
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [spread]);

    return {
        ref,
        spread,
        containerProps: {
            ref,
            'data-spread': spread ? '' : undefined,
            onPointerDown: (e: PointerEvent) => {
                pointerType.current = e.pointerType;
            },
            onClickCapture: (e: MouseEvent) => {
                const touched = pointerType.current === 'touch';
                // a keyboard click after a touch must not look like a touch
                pointerType.current = 'mouse';
                if (enabled && touched && !spread) {
                    e.preventDefault();
                    e.stopPropagation();
                    setSpread(true);
                }
            },
        },
    };
}
