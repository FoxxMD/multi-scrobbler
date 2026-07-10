import type {ComponentProps} from 'react';
import { Icon } from '@chakra-ui/react';

/** Ripple animated "loading" icon
 * 
 * Based on https://loading-ui.com/docs/components/ripple
 */
export const Ripple = ({ className, ...props }: ComponentProps<"svg">) => {
  return (
    <Icon size="sm" asChild>
        <svg
        viewBox="0 0 44 44"
        fill="none"
        stroke="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
        >
        <title>Loading...</title>
        <g fill="none" fillRule="evenodd" strokeWidth="2">
            <circle cx="22" cy="22" r="1">
            <animate
                attributeName="r"
                begin="0s"
                calcMode="spline"
                dur="1.8s"
                keySplines="0.165, 0.84, 0.44, 1"
                keyTimes="0; 1"
                repeatCount="indefinite"
                values="1; 20"
            />
            <animate
                attributeName="stroke-opacity"
                begin="0s"
                calcMode="spline"
                dur="1.8s"
                keySplines="0.3, 0.61, 0.355, 1"
                keyTimes="0; 1"
                repeatCount="indefinite"
                values="1; 0"
            />
            </circle>
            <circle cx="22" cy="22" r="1">
            <animate
                attributeName="r"
                begin="-0.9s"
                calcMode="spline"
                dur="1.8s"
                keySplines="0.165, 0.84, 0.44, 1"
                keyTimes="0; 1"
                repeatCount="indefinite"
                values="1; 20"
            />
            <animate
                attributeName="stroke-opacity"
                begin="-0.9s"
                calcMode="spline"
                dur="1.8s"
                keySplines="0.3, 0.61, 0.355, 1"
                keyTimes="0; 1"
                repeatCount="indefinite"
                values="1; 0"
            />
            </circle>
        </g>
        </svg>
    </Icon>
  );
}