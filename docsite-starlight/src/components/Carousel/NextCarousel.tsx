import React, {useEffect} from 'react'
import BrowserOnly from "@docusaurus/BrowserOnly"
import './NextCarousel.scss';
import { EmblaOptionsType } from 'embla-carousel'
import useEmblaCarousel from 'embla-carousel-react'
import {
  NextButton,
  PrevButton,
  usePrevNextButtons
} from './Arrows'
import {
  SelectedSnapDisplay,
  useSelectedSnapDisplay
} from './SnapDisplay'
import ComponentListDesktop from '../../assets/carousel/msDash.png';
import ComponentList from '../../assets/carousel/msDashMobile.png';
import ComponentDetailed from '../../assets/carousel/ms-componentdetailed.png';
import PlaysList from '../../assets/carousel/ms-playlist.jpg';
import Timeline from '../../assets/carousel/ms-mbemptyquery.png';
import Logs from '../../assets/carousel/ms-logs.jpg';

const EmblaCarousel = (props: {options?: EmblaOptionsType}) => {
  const { options } = props
  const [emblaRef, emblaApi] = useEmblaCarousel(options)

  const {
    prevBtnDisabled,
    nextBtnDisabled,
    onPrevButtonClick,
    onNextButtonClick
  } = usePrevNextButtons(emblaApi)

  const { selectedSnap, snapCount } = useSelectedSnapDisplay(emblaApi)

  return (
    <div className="embla">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          <div className="embla__slide" key="1">
            <div className="embla__slide__container">
              <img src={ComponentListDesktop.src} />
              <div className="imageCaption">Source/Client List on desktop</div>
              </div>
          </div>
          {/* <div className="embla__slide" key="2">
            <div className="embla__slide__container">
              <img src={ComponentList.src} />
              <div className="imageCaption">Source/Client List on mobile</div>
              </div>
          </div> */}
          <div className="embla__slide" key="3">
            <div className="embla__slide__container">
              <img src={ComponentDetailed.src} />
              <div className="imageCaption">Source/Client Details</div>
              </div>
          </div>
          <div className="embla__slide" key="4">
            <div className="embla__slide__container">
              <img src={PlaysList.src} />
              <div className="imageCaption">Search for Plays/Scrobbles with live updates</div>
              </div>
          </div>
          <div className="embla__slide" key="5">
            <div className="embla__slide__container">
              <img src={Timeline.src} />
              <div className="imageCaption">Scrobble timeline audit trail with detailed errors</div>
              </div>
          </div>
          <div className="embla__slide" key="6">
            <div className="embla__slide__container">
              <img src={Logs.src} />
              <div className="imageCaption">Floating logs for dev-level troubleshooting</div>
              </div>
          </div>
        </div>
      </div>

      <div className="embla__controls">
        <div className="embla__buttons">
          <PrevButton onClick={onPrevButtonClick} disabled={prevBtnDisabled} />
          <NextButton onClick={onNextButtonClick} disabled={nextBtnDisabled} />
        </div>
        <SelectedSnapDisplay
          selectedSnap={selectedSnap}
          snapCount={snapCount}
        />
      </div>
    </div>
  )
}

const ClientCarousel = () => {
  return (
    <BrowserOnly>{() => {
      return <EmblaCarousel/>
    }}</BrowserOnly>
  )
}

export default ClientCarousel;