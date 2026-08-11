import { gql } from '@apollo/client';

export const WATCH_WORKFLOW_RUN = gql`
  subscription WatchWorkflowRun($workflow_run_id: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflow_run_id } }
      order_by: { started_at: asc }
    ) {
      id
      workflow_run_id
      step_id
      status
      input
      output
      error_message
      attempt_count
      approved_by
      approved_at
      started_at
      completed_at
    }
  }
`;

export const WATCH_WORKFLOW_RUN_STATUS = gql`
  subscription WatchWorkflowRunStatus($run_id: uuid!) {
    workflow_runs_by_pk(id: $run_id) {
      id
      workflow_id
      status
      current_step_id
      paused_at_step_id
      error_message
      completed_at
    }
  }
`;
