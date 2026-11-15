'use client';

import {
  type Area,
  type ContentReferenceListResponse,
  contentReferenceListResponseSchema,
  type Developer,
  type Project,
  projectSchema,
  type ProjectStage,
  projectStageValues,
  type ProjectSummary,
  publishStatusValues,
} from '@reih/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';
import { ApiError } from '../../api/errors';
import { useApi, useErrorText } from '../../api/hooks';
import { useFullList, usePagedList, useRefreshLists, withQuery } from '../../api/lists';
import { type Column, DataTable } from '../../data-table';
import { ConfirmDialog } from '../../dialog';
import {
  ApiForm,
  CheckboxField,
  FieldPair,
  FormMessage,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useApiForm,
  useFieldErrorText,
} from '../../forms';
import { serverIssueKey } from '../../form-issues';
import { localName } from '../../names';
import { Link, useRouter } from '../../navigation';
import { AuthGate, LoadState } from '../../shell';
import { TABLE_PAGE_SIZE } from '../../table-model';
import { Tabs } from '../../tabs';
import { Ltr, richTags } from '../../text';
import { DateTime } from '../parts';
import { LocationFields } from './location-fields';
import { DATA_OPERATOR, PublishStatusBadge } from './parts';
import {
  amenityCheckable,
  asNullableNumber,
  groupAmenities,
  projectDetailsDefaults,
  projectDetailsRequest,
  projectDetailsSchema,
} from './project-form';

const PATH = '/content/projects';
const DEVELOPERS = '/content/developers';
const AREAS = '/content/areas';
const REFERENCE = '/content/reference';

/** The editor's tabs in part b; Media, Payment plans and Units join in part c. */
const TABS = ['details', 'amenities'] as const;
type ProjectTab = (typeof TABS)[number];

// ---------------------------------------------------------------- list (FR-DAT-04, UC-05.4)

/**
 * FR-DAT-04, UC-05.4: every project, paged by the API (5,000 in the load data), with search on
 * either name and status, stage, developer and community filters.
 */
export function ProjectsScreen() {
  const t = useTranslations('content.projects');
  return (
    <AuthGate roles={DATA_OPERATOR} wide>
      {() => (
        <>
          <h1>{t('title')}</h1>
          <ProjectList />
        </>
      )}
    </AuthGate>
  );
}

type Filters = {
  q?: string;
  status?: string;
  stage?: string;
  developerId?: string;
  communityId?: string;
};

function ProjectList() {
  const t = useTranslations('content.projects');
  const tCommon = useTranslations('content.common');
  const locale = useLocale();
  const [filters, setFilters] = useState<Filters>({});
  const [draft, setDraft] = useState<Required<Filters>>({
    q: '',
    status: '',
    stage: '',
    developerId: '',
    communityId: '',
  });
  const [page, setPage] = useState(1);
  const list = usePagedList<ProjectSummary>(PATH, filters, page, TABLE_PAGE_SIZE);
  const developers = useFullList<Developer>(DEVELOPERS);
  const communities = useFullList<Area>(AREAS, { level: 'community' });

  const columns: Column<ProjectSummary>[] = [
    {
      key: 'name',
      header: t('columns.name'),
      cell: (row) => <Link href={`/projects/${row.id}`}>{localName(row, locale)}</Link>,
    },
    {
      key: 'developer',
      header: t('columns.developer'),
      cell: (row) => localName(row.developer, locale),
    },
    {
      key: 'community',
      header: t('columns.community'),
      cell: (row) => localName(row.community, locale),
    },
    { key: 'stage', header: t('columns.stage'), cell: (row) => t(`stage.${row.stage}`) },
    {
      key: 'status',
      header: tCommon('status'),
      cell: (row) => <PublishStatusBadge status={row.status} />,
    },
    {
      key: 'verified',
      header: t('columns.lastVerified'),
      cell: (row) => (row.lastVerifiedAt ? <Ltr>{row.lastVerifiedAt}</Ltr> : t('neverVerified')),
    },
    {
      key: 'updated',
      header: tCommon('updated'),
      cell: (row) => <DateTime iso={row.updatedAt} />,
    },
  ];

  const search = (event: FormEvent) => {
    event.preventDefault();
    const next: Filters = {};
    for (const [name, value] of Object.entries(draft)) {
      if (value) next[name as keyof Filters] = value;
    }
    setFilters(next);
    setPage(1);
  };
  const filtered = Object.keys(filters).length > 0;

  return (
    <>
      <form className="reih-toolbar" role="search" onSubmit={search}>
        <TextField
          label={t('search')}
          type="search"
          value={draft.q}
          onChange={(event) => setDraft({ ...draft, q: event.target.value })}
        />
        <SelectField
          label={tCommon('status')}
          value={draft.status}
          onChange={(event) => setDraft({ ...draft, status: event.target.value })}
        >
          <option value="">{tCommon('all')}</option>
          {publishStatusValues.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('columns.stage')}
          value={draft.stage}
          onChange={(event) => setDraft({ ...draft, stage: event.target.value })}
        >
          <option value="">{tCommon('all')}</option>
          {projectStageValues.map((stage) => (
            <option key={stage} value={stage}>
              {t(`stage.${stage}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('columns.developer')}
          value={draft.developerId}
          onChange={(event) => setDraft({ ...draft, developerId: event.target.value })}
        >
          <option value="">{t('allDevelopers')}</option>
          {(developers.data ?? []).map((developer) => (
            <option key={developer.id} value={developer.id}>
              {localName(developer, locale)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('columns.community')}
          value={draft.communityId}
          onChange={(event) => setDraft({ ...draft, communityId: event.target.value })}
        >
          <option value="">{t('allCommunities')}</option>
          {(communities.data ?? []).map((community) => (
            <option key={community.id} value={community.id}>
              {localName(community, locale)}
            </option>
          ))}
        </SelectField>
        <button type="submit">{tCommon('apply')}</button>
        <Link href="/projects/new" className="reih-button-link">
          {t('new')}
        </Link>
      </form>
      <DataTable
        caption={t('title')}
        columns={columns}
        rows={list.data?.items}
        rowKey={(row) => row.id}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={filtered ? t('noMatch') : t('empty')}
        server={{ page, total: list.data?.total ?? 0, onPage: setPage }}
      />
    </>
  );
}

// ---------------------------------------------------------------- new project (FR-DAT-04)

/** FR-DAT-04, UC-05.4: a new project, always created as a draft; its page follows. */
export function NewProjectScreen() {
  const t = useTranslations('content.projects');
  const router = useRouter();
  return (
    <AuthGate roles={DATA_OPERATOR} wide>
      {() => (
        <>
          <p>
            <Link href="/projects">{t('back')}</Link>
          </p>
          <h1>{t('newTitle')}</h1>
          <p className="reih-hint">{t('createHint')}</p>
          <section className="reih-card" aria-labelledby="project-details-title">
            <h2 id="project-details-title">{t('tabs.details')}</h2>
            <ProjectDetailsForm onSaved={(project) => router.push(`/projects/${project.id}`)} />
          </section>
        </>
      )}
    </AuthGate>
  );
}

// ---------------------------------------------------------------- one project (FR-DAT-04)

/**
 * FR-DAT-04: one project. The tab is in the address (?tab=), so switching language keeps it and a
 * publishing checklist can link to the tab that fixes an item. An archived project is read-only,
 * with Restore (back to draft).
 */
export function ProjectEditorScreen({ projectId }: { projectId: string }) {
  return (
    <AuthGate roles={DATA_OPERATOR} wide>
      {() => <ProjectEditor projectId={projectId} />}
    </AuthGate>
  );
}

function ProjectEditor({ projectId }: { projectId: string }) {
  const t = useTranslations('content.projects');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const path = `${PATH}/${projectId}`;
  const project = useQuery({
    queryKey: ['item', path],
    queryFn: () => api.get<Project>(path, { schema: projectSchema }),
  });
  const requested = params.get('tab');
  const tab: ProjectTab = TABS.includes(requested as ProjectTab)
    ? (requested as ProjectTab)
    : 'details';

  return (
    <>
      <p>
        <Link href="/projects">{t('back')}</Link>
      </p>
      <LoadState
        pending={project.isPending}
        error={project.error}
        onRetry={() => void project.refetch()}
      >
        {project.data && (
          <>
            <h1>{localName(project.data, locale)}</h1>
            <ProjectHeader project={project.data} />
            <Tabs
              label={t('tabsLabel')}
              selected={tab}
              onSelect={(id) => router.replace(`/projects/${projectId}?tab=${id}`)}
              tabs={TABS.map((id) => ({
                id,
                label: t(`tabs.${id}`),
                content: (
                  // An archived project is read-only (Q4): every field and button of the tab is
                  // disabled; the tabs themselves still switch.
                  <fieldset
                    className="reih-plain-fieldset"
                    disabled={project.data.status === 'archived'}
                  >
                    {id === 'details' ? (
                      <ProjectDetailsForm project={project.data} />
                    ) : (
                      <AmenitiesTab project={project.data} />
                    )}
                  </fieldset>
                ),
              }))}
            />
          </>
        )}
      </LoadState>
    </>
  );
}

function ProjectHeader({ project }: { project: Project }) {
  const t = useTranslations('content.projects');
  const tCommon = useTranslations('content.common');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const [restoring, setRestoring] = useState(false);
  const archived = project.status === 'archived';
  return (
    <section className="reih-card" aria-labelledby="project-status-title">
      <h2 id="project-status-title" className="reih-visually-hidden">
        {tCommon('status')}
      </h2>
      <dl className="reih-facts">
        <div>
          <dt>{tCommon('status')}</dt>
          <dd>
            <PublishStatusBadge status={project.status} />
          </dd>
        </div>
        <div>
          <dt>{t('columns.lastVerified')}</dt>
          <dd>
            {project.lastVerifiedAt ? <Ltr>{project.lastVerifiedAt}</Ltr> : t('neverVerified')}
          </dd>
        </div>
      </dl>
      {archived && (
        <>
          <p className="reih-alert" data-tone="info">
            {t('archivedNotice')}
          </p>
          <div className="reih-actions">
            <button type="button" className="reih-primary" onClick={() => setRestoring(true)}>
              {t('restore')}
            </button>
          </div>
          <ConfirmDialog
            open={restoring}
            onClose={() => setRestoring(false)}
            title={t('restoreTitle')}
            body={t.rich('restoreBody', { name: localName(project, locale), ...richTags })}
            confirmLabel={t('restore')}
            onConfirm={async () => {
              await api.post(`${PATH}/${project.id}/restore`, { schema: projectSchema });
              await refresh(PATH);
            }}
          />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Details (FR-DAT-04)

/**
 * The Details form waits for the developer and area lists: a select registered before its options
 * exist would show "Choose…" for the project's own developer or community, and send it empty.
 */
function ProjectDetailsForm({
  project,
  onSaved,
}: {
  project?: Project;
  onSaved?: (project: Project) => void;
}) {
  const developers = useFullList<Developer>(DEVELOPERS);
  const communities = useFullList<Area>(AREAS, { level: 'community' });
  const emirates = useFullList<Area>(AREAS, { level: 'emirate' });
  const lists = [developers, communities, emirates];
  return (
    <LoadState
      pending={lists.some((list) => list.isPending)}
      error={lists.find((list) => list.error)?.error ?? null}
      onRetry={() => lists.forEach((list) => void list.refetch())}
    >
      {developers.data && communities.data && emirates.data && (
        <ProjectDetailsFields
          project={project}
          onSaved={onSaved}
          developers={developers.data}
          communities={communities.data}
          emirates={emirates.data}
        />
      )}
    </LoadState>
  );
}

/**
 * FR-DAT-04: names and descriptions side by side, developer, community, stage, dates, ownership,
 * service charge, and the location by map or by longitude and latitude. An archived developer or a
 * deactivated community already on the project is shown, marked, but never offered to a new one.
 */
function ProjectDetailsFields({
  project,
  onSaved,
  developers,
  communities,
  emirates,
}: {
  project?: Project;
  onSaved?: (project: Project) => void;
  developers: readonly Developer[];
  communities: readonly Area[];
  emirates: readonly Area[];
}) {
  const t = useTranslations('content.projects');
  const tCommon = useTranslations('content.common');
  const tDialog = useTranslations('dialog');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const form = useApiForm(projectDetailsSchema, {
    defaultValues: projectDetailsDefaults(project),
    onSubmit: async (values) => {
      const body = projectDetailsRequest(values);
      const saved = project
        ? await api.patch<Project>(`${PATH}/${project.id}`, { body, schema: projectSchema })
        : await api.post<Project>(PATH, { body, schema: projectSchema });
      await refresh(PATH);
      onSaved?.(saved);
      return project ? t('saved') : undefined;
    },
  });
  const register = form.form.register as unknown as (
    name: string,
    options?: { setValueAs?: (value: unknown) => unknown },
  ) => ReturnType<typeof form.form.register>;
  const { errors } = form.form.formState;
  const handoverErrors = errors.expectedHandover as
    { message?: string; quarter?: { message?: string }; year?: { message?: string } } | undefined;
  const ownership = form.form.watch('ownershipType');
  const readOnly = project?.status === 'archived';

  const developerChoices = developers.filter(
    (developer) => developer.status === 'active' || developer.id === project?.developer.id,
  );
  const emirateNames = useMemo(
    () => new Map(emirates.map((emirate) => [emirate.id, emirate])),
    [emirates],
  );
  const communityChoices = communities.filter(
    (community) => community.isActive || community.id === project?.community.id,
  );
  // The lists hold every developer and community, so the project's own is there; this is a guard.
  const ownDeveloper = project && !developerChoices.some((d) => d.id === project.developer.id);
  const ownCommunity = project && !communityChoices.some((c) => c.id === project.community.id);

  return (
    <ApiForm
      api={form}
      submitLabel={project ? tCommon('save') : t('create')}
      pendingLabel={tDialog('working')}
    >
      <FieldPair>
        <TextField
          label={tCommon('nameAr')}
          lang="ar"
          dir="rtl"
          error={fieldError(errors.nameAr?.message)}
          {...register('nameAr')}
        />
        <TextField
          label={tCommon('nameEn')}
          lang="en"
          dir="ltr"
          error={fieldError(errors.nameEn?.message)}
          {...register('nameEn')}
        />
      </FieldPair>
      <FieldPair>
        <TextAreaField
          label={tCommon('descriptionAr')}
          lang="ar"
          dir="rtl"
          hint={tCommon('descriptionHint')}
          error={fieldError(errors.descriptionAr?.message)}
          {...register('descriptionAr')}
        />
        <TextAreaField
          label={tCommon('descriptionEn')}
          lang="en"
          dir="ltr"
          hint={tCommon('descriptionHint')}
          error={fieldError(errors.descriptionEn?.message)}
          {...register('descriptionEn')}
        />
      </FieldPair>
      <FieldPair>
        <SelectField
          label={t('columns.developer')}
          error={fieldError(errors.developerId?.message)}
          {...register('developerId')}
        >
          <option value="">{t('chooseDeveloper')}</option>
          {project && ownDeveloper && (
            <option value={project.developer.id}>
              {localName(project.developer, locale)}
              {project.developer.status === 'archived' ? ` ${t('archivedMark')}` : ''}
            </option>
          )}
          {developerChoices.map((developer) => (
            <option key={developer.id} value={developer.id}>
              {localName(developer, locale)}
              {developer.status === 'archived' ? ` ${t('archivedMark')}` : ''}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('columns.community')}
          error={fieldError(errors.communityId?.message)}
          {...register('communityId')}
        >
          <option value="">{t('chooseCommunity')}</option>
          {project && ownCommunity && (
            <option value={project.community.id}>
              {localName(project.community, locale)}
              {project.community.isActive ? '' : ` ${t('inactiveMark')}`}
            </option>
          )}
          {communityChoices.map((community) => {
            const emirate = community.parentId ? emirateNames.get(community.parentId) : undefined;
            return (
              <option key={community.id} value={community.id}>
                {localName(community, locale)}
                {emirate ? ` — ${localName(emirate, locale)}` : ''}
                {community.isActive ? '' : ` ${t('inactiveMark')}`}
              </option>
            );
          })}
        </SelectField>
      </FieldPair>
      <FieldPair>
        <SelectField
          label={t('columns.stage')}
          error={fieldError(errors.stage?.message)}
          {...register('stage')}
        >
          <option value="">{t('chooseStage')}</option>
          {projectStageValues.map((stage: ProjectStage) => (
            <option key={stage} value={stage}>
              {t(`stage.${stage}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('expectedLaunchDate')}
          type="date"
          dir="ltr"
          hint={t('expectedLaunchHint')}
          error={fieldError(errors.expectedLaunchDate?.message)}
          {...register('expectedLaunchDate')}
        />
      </FieldPair>
      <fieldset className="reih-field">
        <legend>{t('expectedHandover')}</legend>
        <p className="reih-hint">{t('expectedHandoverHint')}</p>
        <FieldPair>
          <SelectField
            label={t('quarter')}
            error={fieldError(handoverErrors?.quarter?.message ?? handoverErrors?.message)}
            {...register('expectedHandover.quarter', { setValueAs: asOptionalInteger })}
          >
            <option value="">{t('noQuarter')}</option>
            {[1, 2, 3, 4].map((quarter) => (
              <option key={quarter} value={quarter}>
                {t('quarterOption', { quarter })}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('year')}
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={2000}
            max={2100}
            error={fieldError(handoverErrors?.year?.message)}
            {...register('expectedHandover.year', { setValueAs: asOptionalInteger })}
          />
        </FieldPair>
      </fieldset>
      <FieldPair>
        <TextField
          label={t('actualHandoverDate')}
          type="date"
          dir="ltr"
          error={fieldError(errors.actualHandoverDate?.message)}
          {...register('actualHandoverDate')}
        />
        <TextField
          label={t('serviceCharge')}
          inputMode="decimal"
          dir="ltr"
          hint={t.rich('serviceChargeHint', richTags)}
          error={fieldError(errors.serviceChargeAedPerSqm?.message)}
          {...register('serviceChargeAedPerSqm')}
        />
      </FieldPair>
      <FieldPair>
        <SelectField
          label={t('ownershipType')}
          error={fieldError(errors.ownershipType?.message)}
          {...register('ownershipType')}
        >
          <option value="freehold">{t('ownership.freehold')}</option>
          <option value="leasehold">{t('ownership.leasehold')}</option>
        </SelectField>
        {ownership === 'leasehold' && (
          <TextField
            label={t('leaseTermYears')}
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={1}
            max={99}
            hint={t('leaseTermHint')}
            error={fieldError(errors.leaseTermYears?.message)}
            {...register('leaseTermYears', { setValueAs: asNullableNumber })}
          />
        )}
      </FieldPair>
      <LocationFields
        form={form.form}
        name="location"
        legend={t('location')}
        hint={t.rich('locationHint', richTags)}
        lngLabel={t('lng')}
        latLabel={t('lat')}
        mapLabel={t('locationMap')}
        disabled={readOnly}
      />
    </ApiForm>
  );
}

/** An empty select or number is "not set"; a whole number otherwise. */
const asOptionalInteger = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : Number(value);

// ---------------------------------------------------------------- Amenities (FR-DAT-04)

/**
 * FR-DAT-04, FR-ADM-04: amenities as checkboxes grouped by category. A deactivated amenity already
 * on the project shows checked and marked; it can be unchecked but not checked again.
 */
function AmenitiesTab({ project }: { project: Project }) {
  const t = useTranslations('content.projects.amenities');
  const tDialog = useTranslations('dialog');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const [checked, setChecked] = useState<Set<string>>(() => new Set(project.amenityIds));
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: true } | { ok: false; error: unknown } | null>(null);

  const options = useQuery({
    queryKey: ['list', REFERENCE, 'amenities', project.amenityIds],
    // The checkboxes stay while the list reloads after a save.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const amenities = await api.get<ContentReferenceListResponse>(
        withQuery(`${REFERENCE}/amenities`, {
          include: project.amenityIds.length > 0 ? project.amenityIds.join(',') : undefined,
        }),
        { schema: contentReferenceListResponseSchema },
      );
      // An amenity of a deactivated category names its category through include too.
      const categoryIds = [
        ...new Set(
          amenities.items
            .filter((amenity) => !amenity.isActive && amenity.categoryId)
            .map((amenity) => amenity.categoryId as string),
        ),
      ];
      const categories = await api.get<ContentReferenceListResponse>(
        withQuery(`${REFERENCE}/amenity-categories`, {
          include: categoryIds.length > 0 ? categoryIds.join(',') : undefined,
        }),
        { schema: contentReferenceListResponseSchema },
      );
      return groupAmenities(categories.items, amenities.items);
    },
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setOutcome(null);
    try {
      await api.patch(`${PATH}/${project.id}`, {
        body: { amenityIds: [...checked] },
        schema: projectSchema,
      });
      await refresh(PATH);
      setOutcome({ ok: true });
    } catch (error) {
      setOutcome({ ok: false, error });
    } finally {
      setPending(false);
    }
  };
  const issue =
    outcome && !outcome.ok && outcome.error instanceof ApiError
      ? outcome.error.fieldIssues.find((item) => item.path.startsWith('amenityIds'))
      : undefined;

  return (
    <LoadState
      pending={options.isPending}
      error={options.error}
      onRetry={() => void options.refetch()}
    >
      {options.data && (
        <form onSubmit={(event) => void save(event)} noValidate className="reih-form">
          {outcome?.ok && <FormMessage tone="success">{t('saved')}</FormMessage>}
          {outcome && !outcome.ok && (
            <FormMessage tone="error">
              {issue ? fieldError(serverIssueKey(issue.code)) : errorText(outcome.error)}
            </FormMessage>
          )}
          <p className="reih-hint">{t('hint')}</p>
          {options.data.length === 0 ? (
            <p role="status" className="reih-empty">
              {t('empty')}
            </p>
          ) : (
            options.data.map((group) => (
              <fieldset key={group.category?.id ?? 'other'} className="reih-field reih-checks">
                <legend>
                  {group.category ? localName(group.category, locale) : t('otherGroup')}
                  {group.category && !group.category.isActive ? ` ${t('deactivated')}` : ''}
                </legend>
                {group.amenities.map((amenity) => {
                  const on = checked.has(amenity.id);
                  return (
                    <CheckboxField
                      key={amenity.id}
                      checked={on}
                      disabled={!amenityCheckable(amenity, on)}
                      onChange={(change) => {
                        const next = new Set(checked);
                        if (change.target.checked) next.add(amenity.id);
                        else next.delete(amenity.id);
                        setChecked(next);
                      }}
                      label={
                        <>
                          {localName(amenity, locale)}
                          {amenity.isActive ? '' : ` ${t('deactivated')}`}
                        </>
                      }
                    />
                  );
                })}
              </fieldset>
            ))
          )}
          {options.data.some((group) => group.amenities.some((amenity) => !amenity.isActive)) && (
            <p className="reih-hint">{t('deactivatedHint')}</p>
          )}
          <div className="reih-actions">
            <SubmitButton pending={pending} label={t('save')} pendingLabel={tDialog('working')} />
          </div>
        </form>
      )}
    </LoadState>
  );
}
