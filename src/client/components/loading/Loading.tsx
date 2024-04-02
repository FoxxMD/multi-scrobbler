import React from 'react';
import clsx from 'clsx';
import './Loading.css';

/*https://codepen.io/nikhil8krishnan/pen/rVoXJa*/
export const Loading = (props: {show?: boolean}) => {
    const {show = false} = props || {};
    const classes = ['loading'];
    if(show) {
        classes.push('connected');
    }
    return <svg className={clsx(classes)} version="1.1" id="L9" xmlns="http://www.w3.org/2000/svg"
                x="0px" y="0px"
                xmlnsXlink="http://www.w3.org/1999/xlink"
                viewBox="0 0 100 100" xmlSpace="preserve">
        <path
            d="M73,50c0-12.7-10.3-23-23-23S27,37.3,27,50 M30.9,50c0-10.5,8.5-19.1,19.1-19.1S69.1,39.5,69.1,50">
            <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="rotate"
                dur="1s"
                from="0 50 50"
                to="360 50 50"
                repeatCount="indefinite"/>
        </path>
    </svg>;
}

export default Loading;
