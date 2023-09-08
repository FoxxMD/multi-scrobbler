import React, {useState, useCallback} from 'react';
import './player.scss';
import PlayerTimestamp from "./PlayerTimestamp";
import PlayerControls from "./PlayerControls";

export interface PlayerProps {
    tracks: Track[]

}

export interface Track {
    name: string
    artist: string
    album: string
    year: number
    duration: number
    artwork: string
}

export const sampleTracks: Track[] = [
    {
        name: "Somebody Hates Me",
        artist: "Reel Big Fish",
        album: "Why Do They Rock So Hard?",
        year: 1998,
        duration: 210,
        artwork: "https://is5-ssl.mzstatic.com/image/thumb/Music/59/db/b5/mzi.nloomwwj.jpg/268x0w.jpg"
    },
    {
        name: "Beer",
        artist: "Reel Big Fish",
        album: "We're Not Happy Til You're Not Happy",
        year: 2005,
        duration: 233,
        artwork: "https://upload.wikimedia.org/wikipedia/en/9/9d/Reel_Big_Fish_-_We%27re_Not_Happy_%27til_You%27re_Not_Happy_cover.jpg"
    },
    {
        name: "We Will Fall Together",
        artist: "Streetlight Manifesto",
        album: "Somewhere In The Between",
        year: 2007,
        duration: 289,
        artwork: "https://upload.wikimedia.org/wikipedia/en/9/95/Streetlight_Manifesto_-_Somewhere_in_the_Between.jpg"
    },
    {
        name: "Welcome To The Jungle",
        artist: "Guns N' Roses",
        album: "Appetite For Destruction",
        year: 1987,
        duration: 277,
        artwork: "https://upload.wikimedia.org/wikipedia/en/6/60/GunsnRosesAppetiteforDestructionalbumcover.jpg"
    },
    {
        name: "Estranged",
        artist: "Guns N' Roses",
        album: "Use Your Illusion II",
        year: 1991,
        duration: 563,
        artwork: "https://www.lifeofvinyl.com/images/super/0720642442012.jpg"
    },
    {
        name: "Cheer Up!",
        artist: "Reel Big Fish",
        album: "Cheer Up!",
        year: 2002,
        duration: 163,
        artwork: "https://upload.wikimedia.org/wikipedia/en/f/f9/Reel_Big_Fish_-_Cheer_Up%21_cover.jpg"
    }
];

const Player = (props: PlayerProps) => {
    const [playStatus, setPlayStatus] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(0);
    const [nextTrack, setNextTrack] = useState(1);
    const [prevTrack, setPrevTrack] = useState(props.tracks.length - 1);
    const [currentTime, setCurrentTime] = useState(0);
    const [sliding, setSliding] = useState(0);
    const [viewMode, setViewMode] = useState('player');

    const toggleViewMode = useCallback(() => {
        let newViewMode = "";
        switch(viewMode) {
            case "player":
                newViewMode = "playlist";
                break;
            case "playlist":
                newViewMode = "player"
                break;
        }
        setViewMode(newViewMode);
    }, [viewMode, setViewMode]);

    const togglePlay = useCallback(() => {},[playStatus, setPlayStatus]);
    const changeTrack = useCallback((track) => {}, [props.tracks, nextTrack, prevTrack, setCurrentTrack, setSliding, setCurrentTrack, setNextTrack, setPrevTrack]);
    const toggleNextTrack = useCallback(() => {}, [nextTrack, changeTrack]);
    const togglePrevTrack = useCallback(() => {}, [prevTrack, changeTrack]);
    const setTime = useCallback((time) => {}, [props.tracks, currentTrack, setNextTrack, setCurrentTime]);

    const aPrevTrack = props.tracks[prevTrack];
    const aCurrentTrack = props.tracks[currentTrack];
    const aNextTrack = props.tracks[nextTrack];

    let slidingStatus = "";
    switch (sliding) {
        case -1:
            slidingStatus = "is-sliding-prev";
            break;
        case 1:
            slidingStatus = "is-sliding-next";
            break;
    }

    let playlistIcon = "fa fa-fw ";
    if (viewMode == "playlist") {
        playlistIcon += "fa-times";
    } else {
        playlistIcon += "fa-bars";
    }

    return (
        <div className="wrapper">
            <article className={["player", slidingStatus].join(' ')}>
                <div className="player__bg prev" style={{ backgroundImage: 'url(' + aPrevTrack.artwork + ')' }}></div>
                <div className="player__bg" style={{ backgroundImage: 'url(' + aCurrentTrack.artwork + ')' }}></div>
                <div className="player__bg next" style={{ backgroundImage: 'url(' + aNextTrack.artwork + ')' }}></div>
                <section className="player__art">
                    <img src={aPrevTrack.artwork} alt="" className="prev" />
                    <img src={aCurrentTrack.artwork} alt="" className="current" />
                    <img src={aNextTrack.artwork} alt="" className="next" />

                    {/*<button className="button toggle-playlist" onClick={toggleViewMode}>
              <span className="icon">
                <i className={playlistIcon}></i>
              </span>
                    </button>*/}

                    {/*<Playlist tracks={this.props.tracks} isVisible={this.state.viewMode == "playlist"} changeTrack={this.changeTrack} />*/}
                </section>
                <section className="player__body">
                    <p className="title">{aCurrentTrack.name}</p>
                    <p className="subtitle">{aCurrentTrack.artist}</p>
                    <PlayerTimestamp duration={aCurrentTrack.duration} current={currentTime} />
                </section>
                {/*<PlayerControls isPlaying={playStatus} isLiked={false} togglePlay={togglePlay} nextTrack={toggleNextTrack} prevTrack={togglePrevTrack} likeTrack={() => {}} />*/}
            </article>
        </div>
    );
}

export default Player;

/*
export class PlayerC extends React.Component {
    static get defaultProps() {
        return {

        }
    }

    constructor(props, defaultProps) {
        super(props, defaultProps);

        this.state = {
            playStatus: 0,
            currentTrack: 0,
            nextTrack: 1,
            prevTrack: this.props.tracks.length-1,
            currentTime: 0,
            sliding: 0,
            likedTracks: [],
            viewMode: "player"
        }

        this.togglePlay = this.togglePlay.bind(this);
        this.toggleViewMode = this.toggleViewMode.bind(this);
        this.nextTrack = this.nextTrack.bind(this);
        this.prevTrack = this.prevTrack.bind(this);
        this.likeTrack = this.likeTrack.bind(this);
    }

    toggleViewMode() {
        let viewMode = "";
        switch(this.state.viewMode) {
            case "player":
                viewMode = "playlist";
                break;
            case "playlist":
                viewMode = "player"
                break;
        }

        this.setState({
            viewMode: viewMode
        });
    }

    togglePlay() {
        let status = this.state.playStatus;
        if (status == 0) {
            // Play
            status = 1;
            this.timer = setInterval(() => {
                this.setTime(this.state.currentTime + 1);
            }, 1000);
        } else {
            // Pause
            status = 0;
            clearInterval(this.timer);
        }
        this.setState({ playStatus: status });
    }

    changeTrack(track, dir) {
        if (this.state.sliding == 0) {
            let this_track = track;
            let next_track = track + 1;
            let prev_track = track - 1;

            if (next_track >= this.props.tracks.length) next_track = 0;
            if (prev_track < 0) prev_track = this.props.tracks.length - 1;

            this.setState({
                sliding: dir
            });

            setTimeout(() => {
                this.setState({
                    sliding: 0,
                    currentTrack: this_track,
                    nextTrack: next_track,
                    prevTrack: prev_track,
                    currentTime: 0
                });
            }, 500);
        }
    }

    nextTrack() {
        this.changeTrack(this.state.nextTrack, 1);
    }

    prevTrack() {
        if (this.state.currentTime < 2) {
            this.changeTrack(this.state.prevTrack, -1);
        } else {
            this.setState({
                currentTime: 0
            });
        }
    }

    likeTrack() {
        let likedTracks = this.state.likedTracks;
        let found = false;
        for (let i = 0; i < this.state.likedTracks.length; i++) {
            if (this.state.likedTracks[i] == this.state.currentTrack) {
                found = true;
                likedTracks.splice(i, 1);
                break;
            }
        }

        if (!found) {
            likedTracks.push(this.state.currentTrack);
        }

        this.setState({
            likedTracks: likedTracks
        });
    }

    setTime(time) {
        time = Math.floor(time);
        if (time > this.props.tracks[this.state.currentTrack].duration) {
            this.nextTrack();
        } else {
            this.setState({ currentTime: time });
        }
    }

    render() {
        const prevTrack = this.props.tracks[this.state.prevTrack];
        const currentTrack = this.props.tracks[this.state.currentTrack];
        const nextTrack = this.props.tracks[this.state.nextTrack];

        let sliding = "";
        switch (this.state.sliding) {
            case -1:
                sliding = "is-sliding-prev";
                break;
            case 1:
                sliding = "is-sliding-next";
                break;
        }

        let playlistIcon = "fa fa-fw ";
        if (this.state.viewMode == "playlist") {
            playlistIcon += "fa-times";
        } else {
            playlistIcon += "fa-bars";
        }

        let isLiked = false;
        for (let i = 0; i < this.state.likedTracks.length; i++) {
            if (this.state.likedTracks[i] == this.state.currentTrack) {
                isLiked = true;
            }
        }

        return (
            <div className="wrapper">
                <article className={["player", sliding].join(' ')}>
                    <div className="player__bg prev" style={{ backgroundImage: 'url(' + prevTrack.artwork + ')' }}></div>
                    <div className="player__bg" style={{ backgroundImage: 'url(' + currentTrack.artwork + ')' }}></div>
                    <div className="player__bg next" style={{ backgroundImage: 'url(' + nextTrack.artwork + ')' }}></div>
                    <section className="player__art">
                        <img src={prevTrack.artwork} alt="" className="prev" />
                        <img src={currentTrack.artwork} alt="" className="current" />
                        <img src={nextTrack.artwork} alt="" className="next" />

                        <button className="button toggle-playlist" onClick={this.toggleViewMode}>
              <span className="icon">
                <i className={playlistIcon}></i>
              </span>
                        </button>

                        <Playlist tracks={this.props.tracks} isVisible={this.state.viewMode == "playlist"} changeTrack={this.changeTrack} />
                    </section>
                    <section className="player__body">
                        <p className="title">{currentTrack.name}</p>
                        <p className="subtitle">{currentTrack.artist}</p>
                        <Timestamp duration={currentTrack.duration} current={this.state.currentTime} />
                    </section>
                    <Controls isPlaying={this.state.playStatus} isLiked={isLiked} togglePlay={this.togglePlay} nextTrack={this.nextTrack} prevTrack={this.prevTrack} likeTrack={this.likeTrack} />
                </article>
            </div>
        );
    }
}
*/
