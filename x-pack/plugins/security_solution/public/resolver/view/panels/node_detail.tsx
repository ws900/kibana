/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HTMLAttributes } from 'react';
import React, { memo, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { i18n } from '@kbn/i18n';
import type { EuiDescriptionListProps } from '@elastic/eui';
import { htmlIdGenerator, EuiSpacer, EuiTitle, EuiText, EuiTextColor, EuiLink } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import styled from 'styled-components';
import { StyledDescriptionList, StyledTitle } from './styles';
import * as selectors from '../../store/selectors';
import * as eventModel from '../../../../common/endpoint/models/event';
import { GeneratedText } from '../generated_text';
import { CopyablePanelField } from './copyable_panel_field';
import { Breadcrumbs } from './breadcrumbs';
import { processPath, processPID } from '../../models/process_event';
import * as nodeDataModel from '../../models/node_data';
import { CubeForProcess } from './cube_for_process';
import type { SafeResolverEvent } from '../../../../common/endpoint/types';
import { useCubeAssets } from '../use_cube_assets';
import { PanelLoading } from './panel_loading';
import { StyledPanel } from '../styles';
import { useLinkProps } from '../use_link_props';
import { useFormattedDate } from './use_formatted_date';
import { PanelContentError } from './panel_content_error';
import type { State } from '../../../common/store/types';

const StyledCubeForProcess = styled(CubeForProcess)`
  position: relative;
`;

const nodeDetailError = i18n.translate('xpack.securitySolution.resolver.panel.nodeDetail.Error', {
  defaultMessage: 'Node details were unable to be retrieved',
});

// eslint-disable-next-line react/display-name
export const NodeDetail = memo(function ({ id, nodeID }: { id: string; nodeID: string }) {
  const processEvent = useSelector((state: State) =>
    nodeDataModel.firstEvent(selectors.nodeDataForID(state.analyzer.analyzerById[id])(nodeID))
  );
  const nodeStatus = useSelector((state: State) =>
    selectors.nodeDataStatus(state.analyzer.analyzerById[id])(nodeID)
  );

  return nodeStatus === 'loading' ? (
    <StyledPanel hasBorder>
      <PanelLoading id={id} />
    </StyledPanel>
  ) : processEvent ? (
    <StyledPanel hasBorder data-test-subj="resolver:panel:node-detail">
      <NodeDetailView id={id} nodeID={nodeID} processEvent={processEvent} />
    </StyledPanel>
  ) : (
    <StyledPanel hasBorder>
      <PanelContentError id={id} translatedErrorMessage={nodeDetailError} />
    </StyledPanel>
  );
});

/**
 * A description list view of all the Metadata that goes with a particular process event, like:
 * Created, PID, User/Domain, etc.
 */
// eslint-disable-next-line react/display-name
const NodeDetailView = memo(function ({
  id,
  processEvent,
  nodeID,
}: {
  id: string;
  processEvent: SafeResolverEvent;
  nodeID: string;
}) {
  const processName = eventModel.processNameSafeVersion(processEvent);
  const nodeState = useSelector((state: State) =>
    selectors.nodeDataStatus(state.analyzer.analyzerById[id])(nodeID)
  );
  const relatedEventTotal = useSelector((state: State) => {
    return selectors.relatedEventTotalCount(state.analyzer.analyzerById[id])(nodeID);
  });
  const eventTime = eventModel.eventTimestamp(processEvent);
  const dateTime = useFormattedDate(eventTime);

  const processInfoEntry: EuiDescriptionListProps['listItems'] = useMemo(() => {
    const createdEntry = {
      title: '@timestamp',
      description: dateTime,
    };

    const pathEntry = {
      title: 'process.executable',
      description: processPath(processEvent),
    };

    const pidEntry = {
      title: 'process.pid',
      description: processPID(processEvent),
    };

    const userEntry = {
      title: 'user.name',
      description: eventModel.userName(processEvent),
    };

    const processEntityId = {
      title: 'process.entity_id',
      description: eventModel.entityId(processEvent),
    };

    const domainEntry = {
      title: 'user.domain',
      description: eventModel.userDomain(processEvent),
    };

    const parentPidEntry = {
      title: 'process.parent.pid',
      description: eventModel.parentPID(processEvent),
    };

    const md5Entry = {
      title: 'process.hash.md5',
      description: eventModel.md5HashForProcess(processEvent),
    };

    const commandLineEntry = {
      title: 'process.args',
      description: eventModel.argsForProcess(processEvent),
    };

    const flattenedEntries: Array<{
      title: string;
      description: string | string[] | number | undefined;
    }> = [];

    const flattenedDescriptionListData = [
      createdEntry,
      pathEntry,
      pidEntry,
      processEntityId,
      userEntry,
      domainEntry,
      parentPidEntry,
      md5Entry,
      commandLineEntry,
    ].reduce((flattenedList, entry) => {
      if (Array.isArray(entry.description)) {
        return [
          ...flattenedList,
          ...entry.description.map((value) => {
            return { title: entry.title, description: value };
          }),
        ];
      } else {
        return [...flattenedList, entry];
      }
    }, flattenedEntries);

    // This is the data in {title, description} form for the EuiDescriptionList to display
    const processDescriptionListData = flattenedDescriptionListData
      .filter((entry) => {
        return entry.description !== undefined;
      })
      .map((entry) => {
        return {
          ...entry,
          description: (
            <CopyablePanelField
              textToCopy={String(entry.description)}
              content={<GeneratedText>{String(entry.description)}</GeneratedText>}
            />
          ),
        };
      });

    return processDescriptionListData;
  }, [dateTime, processEvent]);

  const nodesLinkNavProps = useLinkProps(id, {
    panelView: 'nodes',
  });

  const crumbs = useMemo(() => {
    return [
      {
        text: i18n.translate(
          'xpack.securitySolution.endpoint.resolver.panel.processDescList.events',
          {
            defaultMessage: 'Events',
          }
        ),
        'data-test-subj': 'resolver:node-detail:breadcrumbs:node-list-link',
        ...nodesLinkNavProps,
      },
      {
        text: (
          <FormattedMessage
            id="xpack.securitySolution.endpoint.resolver.panel.relatedEventDetail.detailsForProcessName"
            values={{ processName }}
            defaultMessage="Details for: {processName}"
          />
        ),
      },
    ];
  }, [processName, nodesLinkNavProps]);
  const { descriptionText } = useCubeAssets(id, nodeState, false);

  const nodeDetailNavProps = useLinkProps(id, {
    panelView: 'nodeEvents',
    panelParameters: { nodeID },
  });

  const titleID = useMemo(() => htmlIdGenerator('resolverTable')(), []);
  return (
    <>
      <Breadcrumbs breadcrumbs={crumbs} />
      <EuiSpacer size="l" />
      <EuiTitle size="xs">
        <StyledTitle aria-describedby={titleID}>
          <StyledCubeForProcess
            id={id}
            data-test-subj="resolver:node-detail:title-icon"
            state={nodeState}
          />
          <span data-test-subj="resolver:node-detail:title">
            <GeneratedText>{processName}</GeneratedText>
          </span>
        </StyledTitle>
      </EuiTitle>
      <EuiText>
        <EuiTextColor color="subdued">
          <span id={titleID}>{descriptionText}</span>
        </EuiTextColor>
      </EuiText>
      <EuiSpacer size="s" />
      <EuiLink {...nodeDetailNavProps} data-test-subj="resolver:node-detail:node-events-link">
        <FormattedMessage
          id="xpack.securitySolution.endpoint.resolver.panel.processDescList.numberOfEvents"
          values={{ relatedEventTotal }}
          defaultMessage="{relatedEventTotal} Events"
        />
      </EuiLink>
      <EuiSpacer size="l" />
      <StyledDescriptionList
        data-test-subj="resolver:node-detail"
        type="column"
        align="left"
        titleProps={
          {
            'data-test-subj': 'resolver:node-detail:entry-title',
            className: 'desc-title',
            // Casting this to allow data attribute
          } as HTMLAttributes<HTMLElement>
        }
        descriptionProps={
          {
            'data-test-subj': 'resolver:node-detail:entry-description',
          } as HTMLAttributes<HTMLElement>
        }
        compressed
        listItems={processInfoEntry}
      />
    </>
  );
});
