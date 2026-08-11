import { gql } from '@apollo/client';

export const GET_USER_ORGS = gql`
  query GetUserOrgs($user_id: uuid!) {
    org_members(where: { user_id: { _eq: $user_id } }) {
      id
      org_id
      role
      organization {
        id
        name
        usage_quota
        current_usage
        active_running_count
      }
    }
  }
`;

export const GET_ORG_WORKFLOWS = gql`
  query GetOrgWorkflows($org_id: uuid!) {
    workflows(
      where: { org_id: { _eq: $org_id } }
      order_by: { updated_at: desc }
    ) {
      id
      name
      description
      created_at
      updated_at
      workflow_steps {
        id
      }
      workflow_triggers {
        id
        trigger_type
      }
      workflow_runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
        completed_at
      }
    }
  }
`;

export const GET_WORKFLOW_DETAILS = gql`
  query GetWorkflowDetails($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      org_id
      workflow_steps(order_by: { position: asc }) {
        id
        position
        step_type
        config
        true_next_step_id
        false_next_step_id
      }
      workflow_triggers {
        id
        trigger_type
        config
        webhook_secret
      }
    }
  }
`;

export const CREATE_WORKFLOW_MUTATION = gql`
  mutation CreateWorkflow($org_id: uuid!, $name: String!, $description: String) {
    insert_workflows_one(
      object: {
        org_id: $org_id
        name: $name
        description: $description
      }
    ) {
      id
      name
      org_id
    }
  }
`;

export const UPDATE_WORKFLOW_DETAILS_MUTATION = gql`
  mutation UpdateWorkflowDetails($id: uuid!, $name: String!, $description: String) {
    update_workflows_by_pk(
      pk_columns: { id: $id }
      _set: { name: $name, description: $description }
    ) {
      id
      name
      description
    }
  }
`;

export const DELETE_WORKFLOW_MUTATION = gql`
  mutation DeleteWorkflow($id: uuid!) {
    delete_workflows_by_pk(id: $id) {
      id
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN_ACTION = gql`
  mutation TriggerWorkflowRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      id
      workflow_id
      status
    }
  }
`;

export const TRIGGER_WEBHOOK_RUN_ACTION = gql`
  mutation TriggerWebhookRun($webhook_secret: String!, $payload: jsonb) {
    triggerWebhookRun(webhook_secret: $webhook_secret, payload: $payload) {
      id
      workflow_id
      status
      trigger_type
    }
  }
`;

export const APPROVE_STEP_ACTION = gql`
  mutation ApproveStep($step_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id) {
      workflow_run_id
      status
      approved_by
    }
  }
`;

export const SAVE_WORKFLOW_STEPS_MUTATION = gql`
  mutation SaveWorkflowSteps($workflow_id: uuid!, $steps: [workflow_steps_insert_input!]!) {
    delete_workflow_steps(where: { workflow_id: { _eq: $workflow_id } }) {
      affected_rows
    }
    insert_workflow_steps(objects: $steps) {
      affected_rows
      returning {
        id
        position
        step_type
        config
        true_next_step_id
        false_next_step_id
      }
    }
  }
`;

export const SAVE_WORKFLOW_TRIGGER_MUTATION = gql`
  mutation SaveWorkflowTrigger($workflow_id: uuid!, $trigger_type: String!, $config: jsonb) {
    delete_workflow_triggers(where: { workflow_id: { _eq: $workflow_id } }) {
      affected_rows
    }
    insert_workflow_triggers_one(
      object: {
        workflow_id: $workflow_id
        trigger_type: $trigger_type
        config: $config
      }
    ) {
      id
      trigger_type
      config
    }
  }
`;

export const CREATE_WEBHOOK_TRIGGER_ACTION = gql`
  mutation CreateWebhookTrigger($workflow_id: uuid!) {
    createWebhookTrigger(workflow_id: $workflow_id) {
      id
      workflow_id
      webhook_url
      webhook_secret
      message
    }
  }
`;

export const GET_ORG_MEMBERS = gql`
  query GetOrgMembers($org_id: uuid!) {
    org_members(where: { org_id: { _eq: $org_id } }, order_by: { created_at: asc }) {
      id
      org_id
      user_id
      role
      created_at
      user {
        id
        email
        displayName
        avatarUrl
      }
    }
  }
`;

export const ADD_ORG_MEMBER_MUTATION = gql`
  mutation AddOrgMember($org_id: uuid!, $user_id: uuid!, $role: String!) {
    insert_org_members_one(
      object: { org_id: $org_id, user_id: $user_id, role: $role }
    ) {
      id
      org_id
      user_id
      role
    }
  }
`;

export const UPDATE_ORG_MEMBER_ROLE_MUTATION = gql`
  mutation UpdateOrgMemberRole($id: uuid!, $role: String!) {
    update_org_members_by_pk(
      pk_columns: { id: $id }
      _set: { role: $role }
    ) {
      id
      role
    }
  }
`;

export const REMOVE_ORG_MEMBER_MUTATION = gql`
  mutation RemoveOrgMember($id: uuid!) {
    delete_org_members_by_pk(id: $id) {
      id
    }
  }
`;

export const ADD_ORG_MEMBER_BY_EMAIL_ACTION = gql`
  mutation AddOrgMemberByEmail($org_id: uuid!, $email: String!, $role: String!) {
    addOrgMemberByEmail(org_id: $org_id, email: $email, role: $role) {
      success
      message
      member_id
    }
  }
`;

export const CREATE_ORGANIZATION_ACTION = gql`
  mutation CreateOrganization($name: String!) {
    createOrganization(name: $name) {
      id
      name
      role
    }
  }
`;

export const GET_ALL_ORGANIZATIONS = gql`
  query GetAllOrganizations {
    organizations(order_by: { name: asc }) {
      id
      name
    }
  }
`;

export const GET_USER_JOIN_REQUESTS = gql`
  query GetUserJoinRequests($user_id: uuid!) {
    organization_join_requests(
      where: { user_id: { _eq: $user_id } }
      order_by: { requested_at: desc }
    ) {
      id
      org_id
      status
      requested_at
      organization {
        id
        name
      }
    }
  }
`;

export const GET_PENDING_JOIN_REQUESTS = gql`
  query GetPendingJoinRequests($org_id: uuid!) {
    organization_join_requests(
      where: { org_id: { _eq: $org_id }, status: { _eq: "pending" } }
      order_by: { requested_at: asc }
    ) {
      id
      org_id
      user_id
      status
      requested_at
      user {
        id
        email
        displayName
      }
    }
  }
`;

export const CREATE_JOIN_REQUEST_MUTATION = gql`
  mutation CreateJoinRequest($org_id: uuid!, $user_id: uuid!) {
    insert_organization_join_requests_one(
      object: { org_id: $org_id, user_id: $user_id, status: "pending" }
    ) {
      id
      org_id
      status
      requested_at
    }
  }
`;

export const REVIEW_JOIN_REQUEST_ACTION = gql`
  mutation ReviewJoinRequest($request_id: uuid!, $action: String!) {
    reviewJoinRequest(request_id: $request_id, action: $action) {
      success
      message
      status
    }
  }
`;

export const UPDATE_MEMBER_ROLE_ACTION = gql`
  mutation UpdateMemberRole($member_id: uuid!, $role: String!) {
    updateMemberRole(member_id: $member_id, role: $role) {
      success
      message
      member_id
      role
    }
  }
`;

export const REMOVE_ORG_MEMBER_ACTION = gql`
  mutation RemoveOrgMember($member_id: uuid!) {
    removeOrgMember(member_id: $member_id) {
      success
      message
      member_id
    }
  }
`;
