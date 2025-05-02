// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { Card, Flex } from '@radix-ui/themes';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNetworkVariable } from './networkConfig';
import { getObjectExplorerLink } from './utils';

export interface Service {
  id: string;
  fee: number;
  ttl: number;
  owner: string;
  name: string;
}

interface AllowlistProps {
  setRecipientAllowlist: React.Dispatch<React.SetStateAction<string>>;
  setCapId: React.Dispatch<React.SetStateAction<string>>;
}

export function Service({ setRecipientAllowlist, setCapId }: AllowlistProps) {
  const suiClient = useSuiClient();
  const packageId = useNetworkVariable('packageId');
  const currentAccount = useCurrentAccount();
  const [service, setService] = useState<Service>();
  const { id } = useParams();

  useEffect(() => {
    async function getService() {
      // load the service for the given id
      const service = await suiClient.getObject({
        id: id!,
        options: { showContent: true },
      });
      const fields = (service.data?.content as { fields: any })?.fields || {};
      setService({
        id: id!,
        fee: fields.fee,
        ttl: fields.ttl,
        owner: fields.owner,
        name: fields.name,
      });
      setRecipientAllowlist(id!);

      // load all caps
      const res = await suiClient.getOwnedObjects({
        owner: currentAccount?.address!,
        options: {
          showContent: true,
          showType: true,
        },
        filter: {
          StructType: `${packageId}::subscription::Cap`,
        },
      });

      // find the cap for the given service id
      const capId = res.data
        .map((obj) => {
          const fields = (obj!.data!.content as { fields: any }).fields;
          return {
            id: fields?.id.id,
            service_id: fields?.service_id,
          };
        })
        .filter((item) => item.service_id === id)
        .map((item) => item.id) as string[];
      setCapId(capId[0]);
    }

    // Call getService immediately
    getService();

    // Set up interval to call getService every 3 seconds
    const intervalId = setInterval(() => {
      getService();
    }, 3000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, [id]); // Only depend on id since it's needed for the API calls

  return (
    <Flex direction="column" gap="2" justify="start">
      <Card key={`${service?.id}`}>
        <h2 style={{ marginBottom: '1rem' }}>
          Admin View: Service {service?.name} (ID {service?.id && getObjectExplorerLink(service.id)}
          )
        </h2>
        <h3 style={{ marginBottom: '1rem' }}>
          Share&nbsp;
          <a
            href={`${window.location.origin}/subscription-example/view/service/${service?.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'underline' }}
            aria-label="Download encrypted blob"
          >
            this link
          </a>{' '}
          with other users to subscribe to this service and access its files.
        </h3>

        <Flex direction="column" gap="2" justify="start">
          <p>
            <strong>Subscription duration:</strong>{' '}
            {service?.ttl ? service?.ttl / 60 / 1000 : 'null'} minutes
          </p>
          <p>
            <strong>Subscription fee:</strong> {service?.fee} MIST
          </p>
        </Flex>
      </Card>
    </Flex>
  );
}
