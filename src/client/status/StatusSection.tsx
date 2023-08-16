import React, {Fragment} from 'react';
import {
    useQuery,
} from '@tanstack/react-query'
import ky from "ky";
import StatusCardSkeleton from "../components/statusCard/StatusCardSkeleton";
import SourceStatusCard from "../components/statusCard/SourceStatusCard";
import ClientStatusCard from "../components/statusCard/ClientStatusCard";
import {ClientStatusData, SourceStatusData} from "../../core/Atomic";

const StatusSection = () => {
    const {isLoading, isSuccess, isError, data, error} = useQuery({
        queryKey: ['status'], queryFn: async () => {
            return await ky.get('/api/status').json() as { sources: SourceStatusData[], clients: ClientStatusData[] }
        }
    });

    return (
        <Fragment>
            <div className="grid md:grid-cols-3 gap-3">
                {isLoading ? <StatusCardSkeleton loading={isLoading}/> : undefined}
                {isSuccess ? data.sources.map(x => <SourceStatusCard key={`${x.display}-${x.name}`} loading={isLoading}
                                                                     data={x}/>) : undefined}
            </div>
            <div className="grid md:grid-cols-3 gap-3">
                {isSuccess ? data.clients.map(x => <ClientStatusCard key={`${x.display}-${x.name}`} loading={isLoading}
                                                                     data={x}/>) : undefined}
            </div>
        </Fragment>
    );
}

export default StatusSection;
