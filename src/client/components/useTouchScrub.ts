import { useEffect, useRef, useState } from "react";
import type { SystemStyleObject } from "@chakra-ui/react";

/** hover effects only for devices that can actually hover, touch gets them from useTouchScrub */
export const finePointer = '@media (hover: hover) and (pointer: fine)';

/** container css: spread children by `spread` while hovered (fine pointer) or scrubbed (touch) */
export const scrubContainerCss = (spread: SystemStyleObject['spaceX']): SystemStyleObject => ({
    [finePointer]: {_hover: {spaceX: spread}},
    '&[data-scrubbing]': {spaceX: spread},
    // a long press would otherwise select text or open the link/image context menu
    WebkitTouchCallout: 'none',
    userSelect: 'none',
});

/** item css: lift the hovered or scrubbed item above its neighbours */
export const scrubItemCss: SystemStyleObject = {
    _motionSafe: {transitionProperty: 'margin, transform', transitionDuration: 'moderate', transitionTimingFunction: 'ease-out'},
    [finePointer]: {
        _hover: {zIndex: 'docked', _motionSafe: {transform: 'translateY(-0.25rem)'}},
    },
    '&[data-active]': {zIndex: 'docked', _motionSafe: {transform: 'translateY(-0.25rem)'}},
};

const MOVE_TOLERANCE = 10;

/**
 * Touch equivalent of hovering a stack: long press the container, then drag across its items.
 *
 * Items are any descendants with a `data-scrub-index` attribute.
 * `active` is undefined when not scrubbing, the index under the finger while scrubbing, or -1 when the finger is not over an item.
 * While scrubbing the page does not scroll and releasing does not click.
 * Moving before the long press fires is treated as a normal scroll.
 * */
export const useTouchScrub = <T extends HTMLElement>(delay = 300) => {
    const ref = useRef<T>(null);
    const [active, setActive] = useState<number | undefined>(undefined);

    useEffect(() => {
        const el = ref.current;
        if (el === null) {
            return;
        }
        let timer: number | undefined;
        let scrubbing = false;
        let origin = {x: 0, y: 0};

        const indexAt = (x: number, y: number) => {
            const item = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-scrub-index]');
            return item !== null && item !== undefined && el.contains(item) ? Number(item.dataset.scrubIndex) : -1;
        }
        const stop = () => {
            clearTimeout(timer);
            timer = undefined;
            if (scrubbing) {
                scrubbing = false;
                setActive(undefined);
            }
        }
        const onStart = (e: TouchEvent) => {
            stop();
            if (e.touches.length !== 1) {
                return;
            }
            origin = {x: e.touches[0].clientX, y: e.touches[0].clientY};
            timer = window.setTimeout(() => {
                scrubbing = true;
                setActive(indexAt(origin.x, origin.y));
            }, delay);
        }
        const onMove = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!scrubbing) {
                if (Math.hypot(t.clientX - origin.x, t.clientY - origin.y) > MOVE_TOLERANCE) {
                    stop();
                }
                return;
            }
            // only cancelable while the browser has not started scrolling, which it hasn't since the finger was held still
            e.preventDefault();
            setActive(indexAt(t.clientX, t.clientY));
        }
        const onEnd = (e: TouchEvent) => {
            if (scrubbing && e.cancelable) {
                // no click on whatever is under the finger (ie a link)
                e.preventDefault();
            }
            stop();
        }
        const onContextMenu = (e: Event) => {
            if (scrubbing || timer !== undefined) {
                e.preventDefault();
            }
        }

        el.addEventListener('touchstart', onStart, {passive: true});
        el.addEventListener('touchmove', onMove, {passive: false});
        el.addEventListener('touchend', onEnd);
        el.addEventListener('touchcancel', stop);
        el.addEventListener('contextmenu', onContextMenu);
        return () => {
            stop();
            el.removeEventListener('touchstart', onStart);
            el.removeEventListener('touchmove', onMove);
            el.removeEventListener('touchend', onEnd);
            el.removeEventListener('touchcancel', stop);
            el.removeEventListener('contextmenu', onContextMenu);
        }
    }, [delay]);

    return {
        ref,
        active,
        /** spread on the container */
        containerProps: {ref, 'data-scrubbing': active !== undefined ? '' : undefined},
        /** spread on each item */
        itemProps: (index: number) => ({'data-scrub-index': index, 'data-active': active === index ? '' : undefined}),
        /** controlled tooltip `open` for an item, undefined when not scrubbing so normal hover still works */
        tooltipOpen: (index: number) => active === undefined ? undefined : active === index,
    };
}
