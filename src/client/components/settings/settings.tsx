import { useCallback } from "react"
import {
    VStack,
    Heading,
    SegmentGroup,
    Group,
    Box,
    Button
} from "@chakra-ui/react"
import { useTheme } from "next-themes"
import { BsCircleHalf } from "react-icons/bs";
import { LuMoon, LuSun } from "react-icons/lu"
import { CheckIcon, makeChakraIcon } from "../icons/ChakraIcons";
import { useMutation } from "@tanstack/react-query";
import ky from "ky";
import type { CacheClearType } from "../../../core/Api";
import { EphemeralElement } from "../Badges";

const DarkIcon = makeChakraIcon(LuMoon);
const LightIcon = makeChakraIcon(LuSun);
const SystemIcon = makeChakraIcon(BsCircleHalf);

export const SettingsContainer = () => {
    const { resolvedTheme, setTheme, theme } = useTheme();
    const setThemeCB = useCallback((val: string) => {
        switch(val) {
            case 'system':
                setTheme('system');
                localStorage.removeItem('theme');
                break;
            case 'dark':
                setTheme('dark');
                break;
            case 'light':
                setTheme('light');
                break;
        }
    },[setTheme]);

    const {mutate, isPending, variables, isSuccess} = useMutation({
        mutationFn: (clearType: CacheClearType) => ky.delete(`/api/cache/${clearType}`)
    });

    return (
        <VStack alignItems="flex-start">
            <Heading my="3">Appearance</Heading>
            <VStack>
                <SegmentGroup.Root size="md" value={theme === 'system' ? 'system' : resolvedTheme} onValueChange={(val) => setThemeCB(val.value)}>
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Item key="dark" value="dark">
                        <SegmentGroup.ItemText>Dark <DarkIcon/></SegmentGroup.ItemText>
                        <SegmentGroup.ItemHiddenInput />
                    </SegmentGroup.Item>
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Item key="light" value="light">
                        <SegmentGroup.ItemText>Light <LightIcon/></SegmentGroup.ItemText>
                        <SegmentGroup.ItemHiddenInput />
                    </SegmentGroup.Item>
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Item key="system" value="system">
                        <SegmentGroup.ItemText>System <SystemIcon/></SegmentGroup.ItemText>
                        <SegmentGroup.ItemHiddenInput />
                    </SegmentGroup.Item>
                </SegmentGroup.Root>
            </VStack>
            <Heading my="3">Cache</Heading>
            <Box>
            <Group attached>
                <Button colorPalette="red"
                 loading={isPending && variables === 'external-api'}
                 loadingText="Clearing..."
                 disabled={isPending}
                 onClick={() => mutate('external-api')}
                 variant="outline">
                    Clear External API Cache {isSuccess && variables === 'external-api' && <EphemeralElement expires={2000}><CheckIcon/></EphemeralElement>}
                </Button>
                <Button colorPalette="red" 
                loading={isPending && variables === 'transforms'} 
                loadingText="Clearing..."
                disabled={isPending}
                onClick={() => mutate('transforms')}
                variant="outline">
                    Clear Transform Cache {isSuccess && variables === 'transforms' && <EphemeralElement expires={2000}><CheckIcon/></EphemeralElement>}
                </Button>
            </Group>
            </Box>
        </VStack>
    )
}