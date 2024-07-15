import clsx from "clsx";

export interface Props {
    classNames?: string[]
    style?: object
    text?: string
}

const defaultStyle = {}
const defaultClassNames: string[] = ['shrink-0', 'h-5', 'w-5', 'transition', 'text-gray-500', 'hover:text-white', 'cursor-pointer'];

const CopyToClipboard = (props: Props) => {
    const {classNames = [], style = defaultStyle, text } = props;
    const classes = defaultClassNames;
    clsx(classes.concat(classNames))
    return (
        <svg
            onClick={() => {navigator.clipboard.writeText(text)}}
            className={clsx(classes.concat(classNames))} style={style}
             xmlns="http://www.w3.org/2000/svg"
             viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z"></path>
            <path
                d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z">
            </path>
        </svg>
)
}

export default CopyToClipboard;
