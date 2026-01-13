import Details from '@theme/Details';
import type {Props as DetailProps} from '@theme/Details';
import IconWarning from '@theme/Admonition/Icon/Warning';
import IconDanger from '@theme/Admonition/Icon/Danger';
import IconTip from '@theme/Admonition/Icon/Tip';
import IconNote from '@theme/Admonition/Icon/Note';
import { ReactElement } from 'react';

export interface DetailsAdmoProps extends DetailProps {
    type?: 'warning' | 'danger' | 'note' | 'tip'
}

const DetailsAdmo = (props: DetailsAdmoProps) => {

    let cn: string = '';
    let icon: ReactElement;

    switch(props.type) {
        case 'warning':
            cn = 'alert--warning';
            icon = <IconWarning/>;
            break;
        case 'danger':
            cn = 'alert--danger';
            icon = <IconDanger/>;
            break;
        case 'note':
            cn = 'alert--secondary';
            icon = <IconNote/>;
            break;
        case 'tip':
            cn = 'alert--success';
            icon = <IconTip/>
            break;
    }

    const iconWrapper = icon === undefined ? null : <span className="admoIcon">{icon}</span>;

    const summary = <summary>{iconWrapper}{props.summary}</summary>;

    return <Details className={cn} summary={summary}>
        {props.children}
    </Details>

};

export default DetailsAdmo;