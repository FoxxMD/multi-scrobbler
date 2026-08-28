import { useLocalStorage } from "usehooks-ts";
import {Stack, Text, Link, Button} from '@chakra-ui/react';
import {toaster} from './Toaster';

export const WelcomeToast = (props: {}) => {
    const [initialShow, setInitialShow] = useLocalStorage('showWelcome', true);

    if(initialShow) {
        toaster.create({
            id: 'welcome',
            title: 'Welcome to the New UI!',
            type: 'success',
            duration: 10000,
            closable: true,
            description: (
                <Stack>
                    <Text>This is a new UI that will <strong>completely replace</strong> the existing one in the next(ish) release.</Text>
                    <Text>If you have any design feedback or things are not working as you'd expect, please make a comment in <Link color="colorPalette.contrast" fontWeight="extrabold" target="_blank" href="https://github.com/FoxxMD/multi-scrobbler/issues/500">this issue.</Link></Text>
                    <Button onClick={() => {setInitialShow(false); toaster.dismiss('welcome');}}>Don't Show Again</Button>
                </Stack>
            )
        })
    }
    return <></>;
}