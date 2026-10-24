import React, { ReactNode } from 'react';

export type CapLevel = 'yes' | 'config' | 'na' | 'no';

const labels: Record<CapLevel, string> = {
    yes: 'Supported',
    config: 'Supported with configuration',
    na: 'Not applicable',
    no: 'Not available',
};

export const Cap = ({level}: {level: CapLevel}) => (
    <span className="capability-swatch" data-level={level} role="img" aria-label={labels[level]} title={labels[level]}/>
);

export const CapabilityLegend = ({children}: {children?: ReactNode}) => (
    <div className="capability-legend">
        <ul>
            {(Object.keys(labels) as CapLevel[]).map(l => <li key={l}><Cap level={l}/> {labels[l]}</li>)}
        </ul>
        {children !== undefined ? <details>
            <summary>What do these mean?</summary>
            {children}
        </details> : null}
    </div>
);
