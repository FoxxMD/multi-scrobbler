import React from 'react';
import whyDidYouRender from '@welldone-software/why-did-you-render';

if (process.env.NODE_ENV === 'development') {
    console.log('init wdyr')
  whyDidYouRender(React, {
    include: [/ActivityDetails|ActivityCollapsible/],
    exclude: [/^BrowserRouter/, /^Link/, /^Route/],
    // collapseGroups: false,
    // trackHooks: true,
    trackAllPureComponents: false,
    // logOnDifferentValues: true,
  });
}