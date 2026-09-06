'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { StatusEmblem } from '@/components/status-emblem';
import { VendorMark } from '@/components/vendor-mark';

type ProbeCoverage = {
  id: string;
  name: string;
  state: 'NOT_TESTED' | 'TESTED' | 'RETEST_REQUIRED';
  eligibilityState:
    | 'ELIGIBLE'
    | 'BLOCKED'
    | 'NOT_TESTABLE'
    | 'REVIEW_REQUIRED'
    | 'NOT_IN_SCOPE';
  eligibilityReasons: string[];
  methodologyVersionId: string | null;
  testability: 'API_TESTABLE' | 'PARTIALLY_API_TESTABLE' | 'NOT_API_TESTABLE';
  empiricalResult:
    | 'PASS'
    | 'FAIL'
    | 'MATCH'
    | 'MISMATCH'
    | 'INCONCLUSIVE'
    | 'OPERATIONAL_ERROR'
    | null;
  evidenceClass: string | null;
  verifiedOn: string | null;
  limitations: string[];
  requestCount: number;
};

export type DiscoveredModel = {
  id: string;
  vendorId: string;
  name: string;
  vendor: string;
  apiModelId: string | null;
  releaseState: string;
  relevanceState: string;
  apiState: string;
  accountAccess: string;
  accountCheckedOn: string | null;
  discoveredOn: string | null;
  releasedOn: string | null;
  firstTestedOn: string | null;
  lastTestedOn: string | null;
  lifecycleState:
    | 'DISCOVERED'
    | 'EVALUATION_PENDING'
    | 'EVALUATION_AVAILABLE'
    | 'EVALUATION_NOT_POSSIBLE'
    | 'TESTED'
    | 'RETEST_REQUIRED';
  testabilityState:
    | 'AVAILABLE'
    | 'NOT_CURRENTLY_AVAILABLE'
    | 'UNKNOWN_REVIEW_REQUIRED'
    | 'EVALUATABLE'
    | 'PARTIALLY_TESTABLE'
    | 'NOT_TESTABLE'
    | 'REVIEW_REQUIRED';
  evaluationReasons: string[];
  apiAvailabilityState:
    | 'AVAILABLE'
    | 'UNAVAILABLE'
    | 'UNKNOWN'
    | 'AUTH_REQUIRED_TO_VERIFY';
  apiAvailabilityReasons: string[];
  adoptionAssessedOn: string | null;
  queueState:
    | 'NOT_QUEUED'
    | 'ELIGIBILITY_READY'
    | 'BLOCKED'
    | 'ALREADY_TESTED'
    | 'RETEST_POLICY'
    | 'TEST_REQUIRED';
  queueReasons: string[];
  executionState:
    | 'NOT_RUN'
    | 'COMPLETED'
    | 'OPERATIONAL_ERROR'
    | 'EXECUTION_BLOCKED_COST_POLICY';
  probeCoverage: ProbeCoverage[];
  surfaces: Array<{
    id: string;
    product: string;
    name: string;
    kind: 'PROVIDER_API' | 'CONSUMER_PRODUCT_SURFACE';
  }>;
  observationContexts: Array<{
    id: string;
    product: string;
    surface: string;
    probe: string;
    evidenceClass: string;
    observedOn: string;
    applicability: string;
  }>;
  sources: string[];
  reviewReasons: string[];
  defaultProminence: boolean;
};

export type ModelOperationalStatus = {
  id: string;
  sourceCheck: {
    state:
      | 'CHECKED_NO_CHANGE'
      | 'IDENTITY_CHANGED'
      | 'PARTIAL'
      | 'NEEDS_ATTENTION'
      | 'NOT_RECORDED';
    checkedAt: string | null;
    checkedSources: number;
    expectedSources: number;
  };
  eligibilityCheck: {
    state: string;
    checkedAt: string | null;
    stateChangedOn: string | null;
    reasons: string[];
  };
  behavioralEvaluation: {
    state:
      | 'NEVER_RUN'
      | 'EVIDENCE_RECORDED'
      | 'COMPLETED'
      | 'OPERATIONAL_ERROR';
    lastAttemptAt: string | null;
    lastEvidenceAt: string | null;
    lastEvidenceOn: string | null;
    attemptedProbes: number;
    evidenceProbes: number;
    totalProbes: number;
  };
};

type RegistryGroup =
  | 'TESTED'
  | 'RETEST_REQUIRED'
  | 'TEST_REQUIRED'
  | 'EVALUATION_BLOCKED'
  | 'REVIEW_REQUIRED'
  | 'CATALOG_ONLY';

const groupOrder: RegistryGroup[] = [
  'TESTED',
  'RETEST_REQUIRED',
  'TEST_REQUIRED',
  'EVALUATION_BLOCKED',
  'REVIEW_REQUIRED',
  'CATALOG_ONLY',
];

const label = (value: string) => value.replaceAll('_', ' ');
const reasonLabels: Record<string, string> = {
  API_UNKNOWN: 'API availability has not been established',
  API_PENDING: 'The provider documents API access as pending',
  ACCOUNT_ACCESS_NOT_CONFIRMED: 'Account access has not been confirmed',
  ACCOUNT_ACCESS_CHECK_STALE: 'The latest account access check is stale',
  NO_APPROVED_EXECUTABLE_METHODOLOGY:
    'No provider methodology is approved for automatic execution',
  IDENTITY_OR_SOURCE_REVIEW_REQUIRED:
    'Identity or source metadata requires review',
  MODEL_LIFECYCLE_BLOCKED: 'The official model lifecycle blocks evaluation',
  ENDPOINT_OR_PARAMETERS_UNSUPPORTED:
    'The approved harness is incompatible with the documented API surface',
  ACCESS_DENIED: 'The configured account does not have access',
  ERROR: 'The latest access check failed',
  PROVIDER_CREDENTIAL_NOT_CONFIGURED:
    'API verification requires configured provider credentials',
  PUBLIC_SOURCE_IDENTITY_ONLY:
    'The official public source establishes identity, not account access or behavior',
  NO_CURRENT_BEHAVIORAL_EVIDENCE:
    'No current behavioral evidence has been established for this model',
  BEHAVIORAL_SCOPE_AND_METHOD_REQUIRE_REVIEW:
    'A human must define or approve the product surface, probe method, and evidence standard before testing',
  NO_APPROVED_METHODOLOGY: 'This probe needs a reviewed executable methodology',
  PROVIDER_SEMANTICS_REQUIRE_REVIEW:
    'Provider semantics require human review before this methodology can be reused',
  REQUIRED_ENDPOINT_NOT_DOCUMENTED:
    'The required endpoint is not documented as supported',
  EXECUTION_POLICY_DISABLED_OR_ZERO_BUDGET:
    'Paid execution is disabled or has a zero scheduled budget',
  MODEL_NOT_IN_ADOPTION_SCOPE:
    'This catalog identity is not in the reviewed relevant-model adoption scope',
  EXACT_ID_NOT_VISIBLE_TO_CONFIGURED_ACCOUNT:
    'The exact model ID is not visible to the configured API account',
  API_AVAILABILITY_NOT_CHECKED_YET: 'API availability has not been checked yet',
};

const explainReasons = (reasons: string[]) =>
  reasons
    .map(
      (reason) =>
        reasonLabels[reason] ??
        (reason.startsWith('CAPABILITY_NOT_DOCUMENTED_')
          ? `Required capability not documented: ${label(reason.slice(26))}`
          : label(reason)),
    )
    .join('. ');

const sourceStateLabels: Record<
  ModelOperationalStatus['sourceCheck']['state'],
  string
> = {
  CHECKED_NO_CHANGE: 'SCANNED · NO LISTING CHANGE',
  IDENTITY_CHANGED: 'IDENTITY CHANGE DETECTED',
  PARTIAL: 'SOURCE SCAN PARTIAL',
  NEEDS_ATTENTION: 'SOURCE SCAN NEEDS ATTENTION',
  NOT_RECORDED: 'NO SOURCE SCAN RECORDED',
};

const probeStateLabels: Record<ProbeCoverage['state'], string> = {
  NOT_TESTED: 'NO ACCEPTED RESULT',
  TESTED: 'TEST EVIDENCE RECORDED',
  RETEST_REQUIRED: 'RETEST REQUIRED',
};

function localMoment(value: string | null) {
  if (!value) return 'No timestamp recorded';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function calendarDay(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function registryGroup(model: DiscoveredModel): RegistryGroup {
  if (model.lifecycleState === 'TESTED') return 'TESTED';
  if (model.lifecycleState === 'RETEST_REQUIRED') return 'RETEST_REQUIRED';
  if (
    model.testabilityState === 'REVIEW_REQUIRED' ||
    model.relevanceState === 'REVIEW_REQUIRED' ||
    model.reviewReasons.length > 0
  )
    return 'REVIEW_REQUIRED';
  if (model.queueState === 'TEST_REQUIRED') return 'TEST_REQUIRED';
  if (
    model.queueState === 'BLOCKED' ||
    model.lifecycleState === 'EVALUATION_NOT_POSSIBLE'
  )
    return 'EVALUATION_BLOCKED';
  return 'CATALOG_ONLY';
}

function ModelDetail({
  model,
  operations,
}: {
  model: DiscoveredModel;
  operations: ModelOperationalStatus | null;
}) {
  const listingScanApplies =
    model.sources.length > 0 ||
    (operations?.sourceCheck.expectedSources ?? 0) > 0;
  const hasProbeEvidence = model.probeCoverage.some(
    (probe) => probe.empiricalResult || probe.state !== 'NOT_TESTED',
  );
  const eligibilityGroups = [
    ...model.probeCoverage
      .reduce((groups, probe) => {
        const key = `${probe.eligibilityState}|${probe.eligibilityReasons.join('|')}`;
        const group = groups.get(key) ?? {
          state: probe.eligibilityState,
          reasons: probe.eligibilityReasons,
          probes: [] as string[],
        };
        group.probes.push(probe.name);
        groups.set(key, group);
        return groups;
      }, new Map<string, { state: ProbeCoverage['eligibilityState']; reasons: string[]; probes: string[] }>())
      .values(),
  ];
  return (
    <div className="model-row-detail">
      <dl className="model-facts">
        <div>
          <dt>Official model ID</dt>
          <dd>{model.apiModelId ?? 'Not established'}</dd>
        </div>
        <div>
          <dt>First official listing seen</dt>
          <dd>{model.discoveredOn ?? 'Not established'}</dd>
        </div>
        <div>
          <dt>Release state</dt>
          <dd>{label(model.releaseState)}</dd>
        </div>
        <div>
          <dt>Monitor scope decision</dt>
          <dd>{label(model.relevanceState)}</dd>
        </div>
      </dl>

      <div
        className="model-activity"
        aria-label={`${model.name} source scan, test eligibility, and behavioral evidence`}
      >
        <section>
          <span>
            {listingScanApplies ? 'Official-source scan' : 'Catalog provenance'}
          </span>
          <strong>
            {!listingScanApplies
              ? 'CURATED HISTORICAL IDENTITY'
              : operations
                ? sourceStateLabels[operations.sourceCheck.state]
                : 'STATUS SNAPSHOT UNAVAILABLE'}
          </strong>
          {listingScanApplies ? (
            <time dateTime={operations?.sourceCheck.checkedAt ?? undefined}>
              {localMoment(operations?.sourceCheck.checkedAt ?? null)}
            </time>
          ) : (
            <time>No current official listing is asserted</time>
          )}
          {listingScanApplies &&
            operations &&
            operations.sourceCheck.expectedSources > 0 && (
              <small>
                {operations.sourceCheck.checkedSources}/
                {operations.sourceCheck.expectedSources} official source
                {operations.sourceCheck.expectedSources === 1 ? '' : 's'}{' '}
                scanned
              </small>
            )}
          {!listingScanApplies && (
            <small>
              Retained because a dated observation names it; the daily listing
              scan does not apply
            </small>
          )}
        </section>
        <section>
          <span>Behavioral-test eligibility</span>
          <strong>
            {operations
              ? label(operations.eligibilityCheck.state)
              : label(model.testabilityState)}
          </strong>
          <time dateTime={operations?.eligibilityCheck.checkedAt ?? undefined}>
            {localMoment(operations?.eligibilityCheck.checkedAt ?? null)}
          </time>
          {(operations?.eligibilityCheck.stateChangedOn ??
            model.adoptionAssessedOn) && (
            <small>
              Eligibility decision unchanged since{' '}
              {calendarDay(
                operations?.eligibilityCheck.stateChangedOn ??
                  model.adoptionAssessedOn,
              )}
            </small>
          )}
        </section>
        <section>
          <span>Behavioral probe evidence</span>
          <strong>
            {operations?.behavioralEvaluation.state === 'COMPLETED'
              ? 'TESTED'
              : operations?.behavioralEvaluation.state === 'EVIDENCE_RECORDED'
                ? 'EVIDENCE RECORDED'
                : operations?.behavioralEvaluation.state === 'OPERATIONAL_ERROR'
                  ? 'ATTEMPTED · NO VERDICT'
                  : 'NO BEHAVIORAL TEST RECORDED'}
          </strong>
          {operations?.behavioralEvaluation.lastAttemptAt ? (
            <time dateTime={operations.behavioralEvaluation.lastAttemptAt}>
              Last attempt{' '}
              {localMoment(operations.behavioralEvaluation.lastAttemptAt)}
            </time>
          ) : (
            <time>
              {operations?.behavioralEvaluation.lastEvidenceOn
                ? `Accepted evidence dated ${calendarDay(operations.behavioralEvaluation.lastEvidenceOn)}`
                : 'No behavioral probe attempt recorded for this exact model'}
            </time>
          )}
          <small>
            {operations?.behavioralEvaluation.evidenceProbes ?? 0}/
            {operations?.behavioralEvaluation.totalProbes ??
              model.probeCoverage.length}{' '}
            probes with accepted evidence
          </small>
        </section>
      </div>

      {hasProbeEvidence && (
        <div
          className="probe-coverage"
          aria-label={`${model.name} probe coverage`}
        >
          {model.probeCoverage.map((probe) => (
            <div key={probe.id}>
              <span>{probe.name}</span>
              <StatusEmblem
                compact
                value={
                  probe.empiricalResult ??
                  (probe.state === 'TESTED'
                    ? 'TESTED'
                    : probe.state === 'RETEST_REQUIRED'
                      ? 'RETEST REQUIRED'
                      : 'NO TEST EVIDENCE')
                }
              />
              <small>
                {probe.verifiedOn
                  ? `VERIFIED ${calendarDay(probe.verifiedOn)}`
                  : probeStateLabels[probe.state]}
              </small>
            </div>
          ))}
        </div>
      )}

      <div className="model-provenance">
        <h4>What must happen before a behavioral result exists</h4>
        <ul className="eligibility-groups">
          {eligibilityGroups.map((group) => (
            <li key={`${group.state}-${group.probes.join('-')}`}>
              <strong>
                {group.probes.length}/{model.probeCoverage.length} probes ·{' '}
                {label(group.state)}
              </strong>
              <small>
                {group.reasons.length > 0
                  ? explainReasons(group.reasons)
                  : group.state === 'NOT_IN_SCOPE'
                    ? 'No behavioral test plan is attached to this historical catalog identity'
                    : 'No additional reason was recorded'}
              </small>
            </li>
          ))}
        </ul>
        {model.surfaces.length ? (
          <ul>
            {model.surfaces.map((surface) => (
              <li key={surface.id}>
                {surface.product} / {surface.name} · {label(surface.kind)}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No accepted behavioral-test surface is established for this exact
            model. Catalog or API metadata alone cannot establish one.
          </p>
        )}
        {model.observationContexts.length > 0 && (
          <>
            <h4>Dated observation context · not accepted probe evidence</h4>
            <p>
              These records explain why the identity remains visible. They do
              not establish a current official listing or a controlled
              behavioral result.
            </p>
            <ul>
              {model.observationContexts.map((context) => (
                <li key={context.id}>
                  {context.product} / {context.surface} · {context.probe} ·{' '}
                  {context.observedOn} · {context.evidenceClass} ·{' '}
                  {label(context.applicability)}
                </li>
              ))}
            </ul>
          </>
        )}
        {model.sources.length ? (
          <ul>
            {model.sources.map((url, index) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  Official model listing {index + 1}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            This catalog identity predates the recorded source-scan history; no
            automated listing event is attached to it.
          </p>
        )}
      </div>
    </div>
  );
}

function ModelRow({
  model,
  operations,
}: {
  model: DiscoveredModel;
  operations: ModelOperationalStatus | null;
}) {
  const group = registryGroup(model);
  const tested = model.probeCoverage.filter(
    (probe) => probe.empiricalResult || probe.state === 'TESTED',
  ).length;
  return (
    <details className="model-row">
      <summary>
        <ChevronRight aria-hidden="true" />
        <span className="model-row-name">
          <strong>{model.name}</strong>
          <small>{model.apiModelId ?? 'OFFICIAL ID NOT ESTABLISHED'}</small>
        </span>
        <StatusEmblem compact value={group} />
        <span className="model-probe-count">
          {tested}/5 PROBES WITH ACCEPTED EVIDENCE
        </span>
      </summary>
      <ModelDetail model={model} operations={operations} />
    </details>
  );
}

function updateOpenSet(current: Set<string>, key: string, isOpen: boolean) {
  const next = new Set(current);
  if (isOpen) next.add(key);
  else next.delete(key);
  return next;
}

export function ModelInventory({
  models,
  operations = [],
}: {
  models: DiscoveredModel[];
  operations?: ModelOperationalStatus[];
}) {
  const [scope, setScope] = useState<'focus' | 'all'>('focus');
  const [query, setQuery] = useState('');
  const [openVendors, setOpenVendors] = useState(new Set<string>());
  const [openGroups, setOpenGroups] = useState(new Set<string>());
  const needle = query.trim().toLowerCase();
  const operationsByModel = useMemo(
    () => new Map(operations.map((status) => [status.id, status])),
    [operations],
  );

  const visible = useMemo(
    () =>
      models.filter((model) => {
        const matchesText =
          !needle ||
          `${model.name} ${model.vendor} ${model.apiModelId ?? ''}`
            .toLowerCase()
            .includes(needle);
        return (
          (scope === 'all' || model.defaultProminence || Boolean(needle)) &&
          matchesText
        );
      }),
    [models, needle, scope],
  );

  const vendors = useMemo(() => {
    const byVendor = new Map<string, Map<RegistryGroup, DiscoveredModel[]>>();
    for (const model of visible) {
      const groups = byVendor.get(model.vendor) ?? new Map();
      const group = registryGroup(model);
      groups.set(group, [...(groups.get(group) ?? []), model]);
      byVendor.set(model.vendor, groups);
    }
    return [...byVendor.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([vendor, groups]) => ({
        vendor,
        total: [...groups.values()].reduce(
          (sum, items) => sum + items.length,
          0,
        ),
        groups: groupOrder
          .filter((name) => groups.has(name))
          .map((name) => ({
            name,
            models: [...(groups.get(name) ?? [])].sort((left, right) =>
              left.name.localeCompare(right.name),
            ),
          })),
      }));
  }, [visible]);

  const counts = models.reduce<Record<string, number>>((result, model) => {
    const group = registryGroup(model);
    result[group] = (result[group] ?? 0) + 1;
    return result;
  }, {});

  return (
    <section
      className="monitor-section model-inventory"
      id="models"
      aria-labelledby="models-title"
    >
      <div className="section-heading">
        <div>
          <p className="section-code">MODEL COVERAGE</p>
          <h2 id="models-title">What the Monitor knows</h2>
        </div>
        <p>
          A model can appear in an official catalog without being behaviorally
          tested. Open a vendor, then a status group, to see its listing scan,
          test eligibility, and accepted probe evidence as separate claims.
        </p>
      </div>

      <div className="coverage-summary" aria-label="Model registry summary">
        <div>
          <strong>{counts.TESTED ?? 0}</strong>
          <span>Has probe evidence</span>
        </div>
        <div>
          <strong>{counts.TEST_REQUIRED ?? 0}</strong>
          <span>Behavioral test due</span>
        </div>
        <div>
          <strong>{counts.REVIEW_REQUIRED ?? 0}</strong>
          <span>Human review due</span>
        </div>
        <div className="coverage-known">
          <strong>{models.length}</strong>
          <span>Catalog identities tracked</span>
        </div>
      </div>

      <div className="coverage-controls">
        <div className="coverage-scope" aria-label="Model coverage scope">
          <button
            type="button"
            aria-pressed={scope === 'focus'}
            onClick={() => setScope('focus')}
          >
            Actionable focus
          </button>
          <button
            type="button"
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            All known models
          </button>
        </div>
        <label className="coverage-search">
          <span>Find a model or API ID</span>
          <div>
            <Search aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the accepted catalog"
            />
          </div>
        </label>
      </div>

      <p className="coverage-explainer">
        Actionable focus shows identities with evidence or a decision still
        needed. The complete catalog includes every tracked official identity;
        inclusion does not imply API access, product availability, or behavior.
      </p>
      <dl className="coverage-glossary">
        <div>
          <dt>TESTED</dt>
          <dd>At least one probe has accepted behavioral evidence.</dd>
        </div>
        <div>
          <dt>TEST REQUIRED</dt>
          <dd>
            A reviewed method exists and the model is ready to enter the test
            queue; no behavioral result exists yet.
          </dd>
        </div>
        <div>
          <dt>REVIEW REQUIRED</dt>
          <dd>
            A human identity, scope, or methodology decision is still due.
          </dd>
        </div>
        <div>
          <dt>CATALOG ONLY</dt>
          <dd>
            An identity is retained for catalog or historical evidence; current
            listing and behavior are not implied.
          </dd>
        </div>
      </dl>
      <p className="coverage-result-count">
        {visible.length} matching models in {vendors.length} vendor groups.
      </p>

      {vendors.length ? (
        <div className="vendor-register">
          {vendors.map(({ vendor, total, groups }) => {
            const vendorOpen = Boolean(needle) || openVendors.has(vendor);
            return (
              <details
                className="vendor-register-group"
                key={vendor}
                open={vendorOpen}
                onToggle={(event) => {
                  if (!needle) {
                    const isOpen = event.currentTarget.open;
                    setOpenVendors((current) =>
                      updateOpenSet(current, vendor, isOpen),
                    );
                  }
                }}
              >
                <summary>
                  <ChevronRight aria-hidden="true" />
                  <VendorMark
                    vendor={vendor}
                    vendorId={groups[0]?.models[0]?.vendorId}
                  />
                  <strong>{total} MODELS</strong>
                </summary>
                <div className="registry-status-groups">
                  {groups.map((group) => {
                    const groupKey = `${vendor}:${group.name}`;
                    const groupOpen =
                      Boolean(needle) || openGroups.has(groupKey);
                    return (
                      <details
                        className="registry-status-group"
                        key={groupKey}
                        open={groupOpen}
                        onToggle={(event) => {
                          if (!needle) {
                            const isOpen = event.currentTarget.open;
                            setOpenGroups((current) =>
                              updateOpenSet(current, groupKey, isOpen),
                            );
                          }
                        }}
                      >
                        <summary>
                          <ChevronRight aria-hidden="true" />
                          <StatusEmblem compact value={group.name} />
                          <strong>{group.models.length}</strong>
                        </summary>
                        <div className="model-rows">
                          {group.models.map((model) => (
                            <ModelRow
                              key={model.id}
                              model={model}
                              operations={
                                operationsByModel.get(model.id) ?? null
                              }
                            />
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <span>NO MATCHING MODEL</span>
          <p>Try the complete catalog or another model/API identifier.</p>
        </div>
      )}
    </section>
  );
}
