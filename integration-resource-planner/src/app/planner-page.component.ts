import { Component, computed, inject, signal } from '@angular/core';
import { resolveApiBaseUrl } from './api-base-url';
import { AuthService } from './auth.service';

type ForecastRecord = {
  id: number;
  assignedResource: string;
  projectName: string;
  workOrderNumber: string;
  estimate: number;
  startDate: string;
  endDate: string;
  pbsEstHours: string;
  totalForecastedHours: number;
  janHours: number;
  febHours: number;
  marHours: number;
  aprHours: number;
  mayHours: number;
  junHours: number;
  julHours: number;
  augHours: number;
  sepHours: number;
  octHours: number;
  novHours: number;
  decHours: number;
  createdAt: string;
  updatedAt: string;
};

type MissingForecastRecord = {
  resourceAssignmentId: number;
  assignedResource: string;
  projectName: string;
  workOrderNumber: string;
  estimatedHours: number;
  startDate: string;
  endDate: string;
  status: string;
};

type ForecastFilterBy = '' | 'projectName' | 'workOrderNumber' | 'assignedResource';

@Component({
  selector: 'app-planner-page',
  standalone: true,
  template: `
    <section class="forecast-panel">
      <h2>Resource Forecast</h2>

        <div class="forecast-actions" role="group" aria-label="Resource forecast actions">
          @if (!isPractitionerViewOnly()) {
            <button
              type="button"
              [class.active]="selectedAction() === 'Add Forecast'"
              (click)="setAction('Add Forecast')"
            >
              Add Forecast
            </button>
          }
          <button
            type="button"
            [class.active]="selectedAction() === 'View'"
            (click)="setAction('View')"
          >
            View
          </button>
          @if (!isPractitionerViewOnly()) {
            <button
              type="button"
              [class.active]="selectedAction() === 'Update'"
              (click)="setAction('Update')"
            >
              Update
            </button>
          }
        </div>

        @if (selectedAction() === 'Add Forecast') {
          <div class="forecast-input-block">
            <div class="forecast-row">
              <div class="forecast-field">
                <label for="assigned-resource">Assigned Resource</label>

                @if (isLoadingAssignedResources()) {
                  <p class="inline-note">Loading assigned resources...</p>
                } @else {
                  <select
                    id="assigned-resource"
                    [value]="selectedAssignedResource()"
                    (change)="onAssignedResourceChange($any($event.target).value)"
                  >
                    <option value="">Select an assigned resource</option>
                    @for (resource of forecastAssignedResources(); track resource) {
                      <option [value]="resource">{{ resource }}</option>
                    }
                  </select>
                }

                @if (assignedResourcesError()) {
                  <p class="error-message">{{ assignedResourcesError() }}</p>
                }

                @if (selectedAssignedResource() && selectedProject() && selectedWorkOrder()) {
                  <div class="estimate-below-resource">
                    @if (isLoadingEstimate()) {
                      <p class="inline-note">Loading estimated hours...</p>
                    } @else {
                      <div class="estimate-start-row">
                        <div class="inline-field">
                          <label for="forecast-estimate">Estimated Hours</label>
                          <input
                            id="forecast-estimate"
                            type="text"
                            [value]="estimateValue()"
                            readonly
                          />
                        </div>

                        <div class="inline-field">
                          <label for="forecast-start-date">Start Date</label>
                          <input
                            id="forecast-start-date"
                            type="text"
                            [value]="startDateValue()"
                            readonly
                          />
                        </div>

                        <div class="inline-field">
                          <label for="forecast-end-date">End Date</label>
                          <input
                            id="forecast-end-date"
                            type="text"
                            [value]="endDateValue()"
                            readonly
                          />
                        </div>

                        <div class="inline-field">
                          <label>PBS Est. Hours</label>
                          <div class="pbs-radio-group" role="radiogroup" aria-label="PBS Est. Hours">
                            <label class="pbs-radio-option" for="pbs-est-hours-yes">
                              <input
                                id="pbs-est-hours-yes"
                                type="radio"
                                name="pbs-est-hours"
                                value="Yes"
                                [checked]="pbsEstimateValue() === 'Yes'"
                                (change)="onPbsEstimateChange('Yes')"
                              />
                              Yes
                            </label>
                            <label class="pbs-radio-option" for="pbs-est-hours-no">
                              <input
                                id="pbs-est-hours-no"
                                type="radio"
                                name="pbs-est-hours"
                                value="No"
                                [checked]="pbsEstimateValue() === 'No'"
                                (change)="onPbsEstimateChange('No')"
                              />
                              No
                            </label>
                          </div>
                        </div>

                        <div class="inline-field">
                          <label for="forecast-total-hours">Total Forecasted Hours</label>
                          <input
                            id="forecast-total-hours"
                            type="text"
                            [value]="totalForecastedHours()"
                            [class.total-hours-ok]="totalForecastedHoursState() === 'ok'"
                            [class.total-hours-over]="totalForecastedHoursState() === 'over'"
                            readonly
                          />
                        </div>
                      </div>
                    }

                    @if (estimateError()) {
                      <p class="error-message">{{ estimateError() }}</p>
                    }
                  </div>
                }
              </div>

              @if (selectedAssignedResource()) {
                <div class="forecast-field">
                  <label for="forecast-project">Project</label>

                  @if (isLoadingProjects()) {
                    <p class="inline-note">Loading projects...</p>
                  } @else {
                    <select
                      id="forecast-project"
                      [value]="selectedProject()"
                      (change)="onProjectChange($any($event.target).value)"
                    >
                      <option value="">Select a project</option>
                      @for (project of availableProjects(); track project) {
                        <option [value]="project">{{ project }}</option>
                      }
                    </select>
                  }

                  @if (projectsError()) {
                    <p class="error-message">{{ projectsError() }}</p>
                  }
                </div>
              }

              @if (selectedAssignedResource() && selectedProject()) {
                <div class="forecast-field">
                  <label for="forecast-work-order">Work Order Number</label>

                  @if (isLoadingWorkOrders()) {
                    <p class="inline-note">Loading work orders...</p>
                  } @else {
                    <select
                      id="forecast-work-order"
                      [value]="selectedWorkOrder()"
                      (change)="onWorkOrderChange($any($event.target).value)"
                    >
                      <option value="">Select a work order</option>
                      @for (workOrder of availableWorkOrders(); track workOrder) {
                        <option [value]="workOrder">{{ workOrder }}</option>
                      }
                    </select>
                  }

                  @if (workOrdersError()) {
                    <p class="error-message">{{ workOrdersError() }}</p>
                  }
                </div>
              }

            </div>

            <div class="monthly-forecast-table-wrap">
              <table class="monthly-forecast-table">
                <thead>
                  <tr>
                    <th>Jan</th>
                    <th>Feb</th>
                    <th>Mar</th>
                    <th>Apr</th>
                    <th>May</th>
                    <th>Jun</th>
                    <th>Jul</th>
                    <th>Aug</th>
                    <th>Sep</th>
                    <th>Oct</th>
                    <th>Nov</th>
                    <th>Dec</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><input type="text" [value]="monthlyValues()[0]" (input)="onMonthlyValueInput(0, $any($event.target).value)" aria-label="January value" /></td>
                    <td><input type="text" [value]="monthlyValues()[1]" (input)="onMonthlyValueInput(1, $any($event.target).value)" aria-label="February value" /></td>
                    <td><input type="text" [value]="monthlyValues()[2]" (input)="onMonthlyValueInput(2, $any($event.target).value)" aria-label="March value" /></td>
                    <td><input type="text" [value]="monthlyValues()[3]" (input)="onMonthlyValueInput(3, $any($event.target).value)" aria-label="April value" /></td>
                    <td><input type="text" [value]="monthlyValues()[4]" (input)="onMonthlyValueInput(4, $any($event.target).value)" aria-label="May value" /></td>
                    <td><input type="text" [value]="monthlyValues()[5]" (input)="onMonthlyValueInput(5, $any($event.target).value)" aria-label="June value" /></td>
                    <td><input type="text" [value]="monthlyValues()[6]" (input)="onMonthlyValueInput(6, $any($event.target).value)" aria-label="July value" /></td>
                    <td><input type="text" [value]="monthlyValues()[7]" (input)="onMonthlyValueInput(7, $any($event.target).value)" aria-label="August value" /></td>
                    <td><input type="text" [value]="monthlyValues()[8]" (input)="onMonthlyValueInput(8, $any($event.target).value)" aria-label="September value" /></td>
                    <td><input type="text" [value]="monthlyValues()[9]" (input)="onMonthlyValueInput(9, $any($event.target).value)" aria-label="October value" /></td>
                    <td><input type="text" [value]="monthlyValues()[10]" (input)="onMonthlyValueInput(10, $any($event.target).value)" aria-label="November value" /></td>
                    <td><input type="text" [value]="monthlyValues()[11]" (input)="onMonthlyValueInput(11, $any($event.target).value)" aria-label="December value" /></td>
                  </tr>
                </tbody>
              </table>
            </div>

            @if (pbsAllocationError()) {
              <p class="error-message">{{ pbsAllocationError() }}</p>
            }

            @if (forecastSaveError()) {
              <p class="error-message">{{ forecastSaveError() }}</p>
            }

            @if (forecastSaveHazard()) {
              <p class="hazard-message">
                <span class="hazard-icon" aria-hidden="true">!</span>
                <span>{{ forecastSaveHazard() }}</span>
              </p>
            }

            @if (forecastSaveSuccess()) {
              <p class="success-message">{{ forecastSaveSuccess() }}</p>
            }

            <div class="forecast-save-row">
              <button
                type="button"
                class="forecast-save-btn"
                [disabled]="isSavingForecast()"
                (click)="onSaveForecast()"
              >
                {{ isSavingForecast() ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        }

        @if (selectedAction() === 'Update') {
          <div class="forecast-input-block">
            @if (isLoadingUpdateForecastRecords()) {
              <p class="inline-note">Loading forecast records...</p>
            }

            @if (updateForecastError()) {
              <p class="error-message">{{ updateForecastError() }}</p>
            }

            @if (updateForecastHazard()) {
              <p class="hazard-message">
                <span class="hazard-icon" aria-hidden="true">!</span>
                <span>{{ updateForecastHazard() }}</span>
              </p>
            }

            @if (updateForecastSuccess()) {
              <p class="success-message">{{ updateForecastSuccess() }}</p>
            }

            @if (!isLoadingUpdateForecastRecords() && updateForecastRecords().length > 0) {
              <div class="forecast-view-actions">
                <div class="display-filter-group">
                  <label class="display-filter-label" for="update-filter-by-select">Filter By</label>
                  <select
                    id="update-filter-by-select"
                    class="display-filter-select"
                    [value]="selectedUpdateFilterBy()"
                    (change)="onUpdateFilterByChange($any($event.target).value)"
                  >
                    <option value="">None</option>
                    <option value="projectName">Project</option>
                    <option value="workOrderNumber">Work Order</option>
                    <option value="assignedResource">Assigned Resource</option>
                  </select>

                  @if (selectedUpdateFilterBy()) {
                    <label class="display-filter-label" for="update-filter-value-select">Value</label>
                    <select
                      id="update-filter-value-select"
                      class="display-filter-select"
                      [value]="selectedUpdateFilterValue()"
                      (change)="onUpdateFilterValueChange($any($event.target).value)"
                    >
                      <option value="">All</option>
                      @for (filterValue of availableUpdateFilterValues(); track filterValue) {
                        <option [value]="filterValue">{{ filterValue }}</option>
                      }
                    </select>
                  }
                </div>
              </div>
            }

            @if (!isLoadingUpdateForecastRecords() && !updateForecastError() && updateForecastRecords().length === 0) {
              <p class="inline-note">No forecast records found.</p>
            }

            @if (!isLoadingUpdateForecastRecords() && updateForecastRecords().length > 0 && filteredUpdateForecastRecords().length === 0) {
              <p class="inline-note">No records match the current filter.</p>
            }

            @if (filteredUpdateForecastRecords().length > 0) {
              <div class="forecast-update-table-wrap">
                <table class="forecast-update-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Assigned Resource</th>
                      <th>Project</th>
                      <th>Work Order Number</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Est. Hours</th>
                      <th>PBS</th>
                      <th>Fcst Hrs</th>
                      <th>Jan</th>
                      <th>Feb</th>
                      <th>Mar</th>
                      <th>Apr</th>
                      <th>May</th>
                      <th>Jun</th>
                      <th>Jul</th>
                      <th>Aug</th>
                      <th>Sep</th>
                      <th>Oct</th>
                      <th>Nov</th>
                      <th>Dec</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of filteredUpdateForecastRecords(); track row.id) {
                      <tr>
                        <td>{{ row.id }}</td>
                        <td><input type="text" [value]="row.assignedResource" (input)="onUpdateForecastFieldInput(row.id, 'assignedResource', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.projectName" (input)="onUpdateForecastFieldInput(row.id, 'projectName', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.workOrderNumber" (input)="onUpdateForecastFieldInput(row.id, 'workOrderNumber', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.startDate" (input)="onUpdateForecastFieldInput(row.id, 'startDate', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.endDate" (input)="onUpdateForecastFieldInput(row.id, 'endDate', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.estimate" (input)="onUpdateForecastFieldInput(row.id, 'estimate', $any($event.target).value)" /></td>
                        <td>
                          <select [value]="row.pbsEstHours" (change)="onUpdateForecastFieldInput(row.id, 'pbsEstHours', $any($event.target).value)">
                            <option value=""></option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        <td><input type="text" [value]="row.totalForecastedHours" (input)="onUpdateForecastFieldInput(row.id, 'totalForecastedHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.janHours" (input)="onUpdateForecastFieldInput(row.id, 'janHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.febHours" (input)="onUpdateForecastFieldInput(row.id, 'febHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.marHours" (input)="onUpdateForecastFieldInput(row.id, 'marHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.aprHours" (input)="onUpdateForecastFieldInput(row.id, 'aprHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.mayHours" (input)="onUpdateForecastFieldInput(row.id, 'mayHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.junHours" (input)="onUpdateForecastFieldInput(row.id, 'junHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.julHours" (input)="onUpdateForecastFieldInput(row.id, 'julHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.augHours" (input)="onUpdateForecastFieldInput(row.id, 'augHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.sepHours" (input)="onUpdateForecastFieldInput(row.id, 'sepHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.octHours" (input)="onUpdateForecastFieldInput(row.id, 'octHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.novHours" (input)="onUpdateForecastFieldInput(row.id, 'novHours', $any($event.target).value)" /></td>
                        <td><input type="text" [value]="row.decHours" (input)="onUpdateForecastFieldInput(row.id, 'decHours', $any($event.target).value)" /></td>
                        <td class="update-actions-cell">
                          <button type="button" class="row-action-btn" [disabled]="updatingForecastId() === row.id || deletingForecastId() === row.id" (click)="onUpdateForecastRow(row.id)">
                            {{ updatingForecastId() === row.id ? 'Updating...' : 'Update' }}
                          </button>
                          <button type="button" class="row-delete-btn" [disabled]="updatingForecastId() === row.id || deletingForecastId() === row.id" (click)="onDeleteForecastRow(row.id)">
                            {{ deletingForecastId() === row.id ? 'Deleting...' : 'Delete' }}
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        @if (selectedAction() === 'View') {
          <div class="forecast-input-block">
            @if (selectedViewDisplay() === 'active forecast' && isLoadingForecastRecords()) {
              <p class="inline-note">Loading active forecast records...</p>
            }

            @if (selectedViewDisplay() === 'missing forecast' && isLoadingMissingForecastRecords()) {
              <p class="inline-note">Loading missing forecast records...</p>
            }

            @if (forecastViewError()) {
              <p class="error-message">{{ forecastViewError() }}</p>
            }

            <div class="forecast-view-actions">
              <div class="display-filter-group">
                <label class="display-filter-label" for="forecast-display-select">Report</label>
                <select
                  id="forecast-display-select"
                  class="display-filter-select"
                  [value]="selectedViewDisplay()"
                  (change)="onViewDisplayChange($any($event.target).value)"
                >
                  <option value="active forecast">Active Forecast</option>
                  <option value="missing forecast">Missing Forecast</option>
                </select>

                <label class="display-filter-label" for="forecast-filter-by-select">Filter By</label>
                <select
                  id="forecast-filter-by-select"
                  class="display-filter-select"
                  [value]="selectedViewFilterBy()"
                  (change)="onViewFilterByChange($any($event.target).value)"
                >
                  <option value="">None</option>
                  <option value="projectName">Project</option>
                  <option value="workOrderNumber">Work Order</option>
                  <option value="assignedResource">Assigned Resource</option>
                </select>

                @if (selectedViewFilterBy()) {
                  <label class="display-filter-label" for="forecast-filter-value-select">Value</label>
                  <select
                    id="forecast-filter-value-select"
                    class="display-filter-select"
                    [value]="selectedViewFilterValue()"
                    (change)="onViewFilterValueChange($any($event.target).value)"
                  >
                    <option value="">All</option>
                    @for (filterValue of availableViewFilterValues(); track filterValue) {
                      <option [value]="filterValue">{{ filterValue }}</option>
                    }
                  </select>
                }
              </div>

              @if (selectedViewDisplay() === 'active forecast' && filteredForecastRecords().length > 0) {
                <button type="button" class="forecast-export-btn" (click)="exportForecastToExcel()">
                  Export to Excel
                </button>
              }
            </div>

            @if (
              selectedViewDisplay() === 'active forecast' &&
              !isLoadingForecastRecords() &&
              !forecastViewError() &&
              filteredForecastRecords().length === 0
            ) {
              <p class="inline-note">No active forecast records found.</p>
            }

            @if (selectedViewDisplay() === 'active forecast' && filteredForecastRecords().length > 0) {
              <div class="forecast-view-table-wrap">
                <table class="forecast-view-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Assigned Resource</th>
                      <th>Project</th>
                      <th>Work Order Number</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Estimated Hours</th>
                      <th>Fcst Hrs</th>
                      <th>Variance</th>
                      <th>Jan</th>
                      <th>Feb</th>
                      <th>Mar</th>
                      <th>Apr</th>
                      <th>May</th>
                      <th>Jun</th>
                      <th>Jul</th>
                      <th>Aug</th>
                      <th>Sep</th>
                      <th>Oct</th>
                      <th>Nov</th>
                      <th>Dec</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of filteredForecastRecords(); track row.id) {
                      <tr>
                        <td>{{ row.id }}</td>
                        <td>{{ row.assignedResource }}</td>
                        <td>{{ row.projectName }}</td>
                        <td>{{ row.workOrderNumber }}</td>
                        <td>{{ row.startDate }}</td>
                        <td>{{ row.endDate }}</td>
                        <td>{{ row.estimate }}</td>
                        <td>{{ row.totalForecastedHours }}</td>
                        <td [class.variance-ok]="calculateVariance(row) >= 0" [class.variance-over]="calculateVariance(row) < 0">
                          {{ formatVariance(calculateVariance(row)) }}
                        </td>
                        <td>{{ row.janHours }}</td>
                        <td>{{ row.febHours }}</td>
                        <td>{{ row.marHours }}</td>
                        <td>{{ row.aprHours }}</td>
                        <td>{{ row.mayHours }}</td>
                        <td>{{ row.junHours }}</td>
                        <td>{{ row.julHours }}</td>
                        <td>{{ row.augHours }}</td>
                        <td>{{ row.sepHours }}</td>
                        <td>{{ row.octHours }}</td>
                        <td>{{ row.novHours }}</td>
                        <td>{{ row.decHours }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            @if (
              selectedViewDisplay() === 'missing forecast' &&
              !isLoadingMissingForecastRecords() &&
              !forecastViewError() &&
              filteredMissingForecastRecords().length === 0
            ) {
              <p class="inline-note">No missing forecast records found.</p>
            }

            @if (selectedViewDisplay() === 'missing forecast' && filteredMissingForecastRecords().length > 0) {
              <div class="forecast-view-table-wrap">
                <table class="forecast-view-table missing-forecast-table">
                  <thead>
                    <tr>
                      @if (!isPractitionerViewOnly()) {
                        <th>Actions</th>
                      }
                      <th>ID</th>
                      <th>Assigned Resource</th>
                      <th>Project</th>
                      <th>Work Order Number</th>
                      <th>Est. Hours</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of filteredMissingForecastRecords(); track row.resourceAssignmentId) {
                      <tr>
                        @if (!isPractitionerViewOnly()) {
                          <td class="missing-forecast-actions-cell">
                            <button
                              type="button"
                              class="row-action-btn"
                              (click)="onAddForecastFromMissing(row)"
                            >
                              Add Forecast
                            </button>
                          </td>
                        }
                        <td>{{ row.resourceAssignmentId }}</td>
                        <td>{{ row.assignedResource }}</td>
                        <td>{{ row.projectName }}</td>
                        <td>{{ row.workOrderNumber }}</td>
                        <td>{{ row.estimatedHours }}</td>
                        <td>{{ row.startDate }}</td>
                        <td>{{ row.endDate }}</td>
                        <td>{{ row.status }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
    </section>
  `,
  styles: `
    .forecast-panel {
      max-width: 96rem;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d8e1ee;
      border-radius: 0.75rem;
      padding: 1.25rem;
      box-shadow: 0 8px 20px rgba(24, 59, 98, 0.08);
    }

    h2 {
      margin: 0 0 1rem;
      font-size: 1.35rem;
      color: #10233f;
    }

    label {
      display: block;
      margin-bottom: 0.4rem;
      font-weight: 600;
      color: #334b68;
    }

    select {
      min-width: 12rem;
      border: 1px solid #c4d5ea;
      border-radius: 0.45rem;
      padding: 0.5rem 0.6rem;
      font-size: 0.95rem;
      color: #10233f;
      background: #ffffff;
    }

    input[type='text'] {
      width: 100%;
      border: 1px solid #c4d5ea;
      border-radius: 0.45rem;
      padding: 0.5rem 0.6rem;
      font-size: 0.95rem;
      color: #10233f;
      background: #f7fafc;
    }

    .forecast-actions {
      margin-top: 0.5rem;
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .forecast-actions button {
      border: 1px solid #c4d5ea;
      background: #ffffff;
      color: #1a3f70;
      border-radius: 0.5rem;
      padding: 0.5rem 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }

    .forecast-actions button.active {
      background: #1f4d85;
      border-color: #1f4d85;
      color: #ffffff;
    }

    .forecast-input-block {
      margin-top: 1rem;
    }

    .inline-note {
      margin: 0;
      color: #42586f;
    }

    .forecast-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(12rem, 1fr));
      gap: 0.85rem;
      align-items: start;
    }

    .forecast-field {
      min-width: 0;
    }

    .estimate-below-resource {
      margin-top: 0.85rem;
    }

    .estimate-start-row {
      display: grid;
      grid-template-columns: repeat(5, minmax(10rem, 1fr));
      column-gap: 3rem;
      row-gap: 0.6rem;
    }

    .inline-field {
      min-width: 0;
    }

    .pbs-radio-group {
      display: flex;
      align-items: center;
      gap: 1rem;
      min-height: 2.1rem;
    }

    .pbs-radio-option {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      font-weight: 600;
      color: #334b68;
    }

    .forecast-field select {
      width: 100%;
    }

    .error-message {
      margin: 0.6rem 0 0;
      color: #9c1e1e;
      font-weight: 600;
    }

    .success-message {
      margin: 0.6rem 0 0;
      color: #1f6b43;
      font-weight: 600;
    }

    .hazard-message {
      margin: 0.6rem 0 0;
      color: #8a4b00;
      background: #fff4e5;
      border: 1px solid #ffc266;
      border-radius: 0.4rem;
      padding: 0.45rem 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-weight: 600;
    }

    .hazard-icon {
      width: 1.1rem;
      height: 1.1rem;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #d97a00;
      color: #ffffff;
      font-size: 0.78rem;
      font-weight: 800;
      line-height: 1;
      flex: 0 0 auto;
    }

    .monthly-forecast-table-wrap {
      margin-top: 1rem;
      overflow-x: auto;
      border: 1px solid #d8e1ee;
      border-radius: 0.5rem;
      background: #ffffff;
    }

    .monthly-forecast-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 58rem;
    }

    .monthly-forecast-table th {
      background: #eef4fb;
      color: #1a3f70;
      font-weight: 700;
      text-align: center;
      padding: 0.65rem 0.5rem;
      border-right: 1px solid #d8e1ee;
      white-space: nowrap;
    }

    .monthly-forecast-table th:last-child {
      border-right: 0;
    }

    .monthly-forecast-table td {
      padding: 0.45rem;
      border-top: 1px solid #d8e1ee;
      border-right: 1px solid #d8e1ee;
      background: #ffffff;
    }

    .monthly-forecast-table td:last-child {
      border-right: 0;
    }

    .monthly-forecast-table td input {
      width: 5ch;
      min-width: 5ch;
      max-width: 5ch;
      border: 1px solid #c4d5ea;
      border-radius: 0.35rem;
      padding: 0.4rem 0.45rem;
      font-size: 0.9rem;
      color: #10233f;
      background: #ffffff;
    }

    #forecast-total-hours.total-hours-ok {
      background: #e7f7ec;
      border-color: #2e8b57;
      color: #1f6b43;
      font-weight: 700;
    }

    #forecast-total-hours.total-hours-over {
      background: #fdeaea;
      border-color: #c0392b;
      color: #8f251c;
      font-weight: 700;
    }

    .forecast-save-row {
      margin-top: 0.9rem;
      display: flex;
      justify-content: flex-end;
    }

    .forecast-save-btn {
      border: 1px solid #1f4d85;
      background: #1f4d85;
      color: #ffffff;
      border-radius: 0.5rem;
      padding: 0.5rem 1rem;
      font-weight: 600;
      cursor: pointer;
    }

    .forecast-save-btn:hover {
      background: #173a64;
      border-color: #173a64;
    }

    .forecast-save-btn:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    .forecast-view-table-wrap {
      margin-top: 0.5rem;
      overflow-x: auto;
      border: 1px solid #d8e1ee;
      border-radius: 0.5rem;
      background: #ffffff;
    }

    .forecast-view-table {
      width: 100%;
      min-width: 140rem;
      border-collapse: collapse;
    }

    .forecast-view-table th {
      background: #eef4fb;
      color: #1a3f70;
      font-weight: 700;
      text-align: left;
      padding: 0.55rem 0.5rem;
      border-right: 1px solid #d8e1ee;
      white-space: nowrap;
    }

    .forecast-view-table td {
      border-top: 1px solid #d8e1ee;
      border-right: 1px solid #d8e1ee;
      padding: 0.5rem;
      white-space: nowrap;
      color: #10233f;
      font-size: 0.9rem;
    }

    .forecast-view-table td.variance-ok {
      background: #e7f7ec;
      color: #1f6b43;
      font-weight: 700;
    }

    .forecast-view-table td.variance-over {
      background: #fdeaea;
      color: #8f251c;
      font-weight: 700;
    }

    .forecast-view-table th:last-child,
    .forecast-view-table td:last-child {
      border-right: 0;
    }

    .missing-forecast-actions-cell {
      width: auto;
      min-width: auto;
      max-width: auto;
    }

    /* ID column - nth-child(2) when Actions visible, nth-child(1) when Actions hidden */
    .missing-forecast-table th:nth-child(2):not(.missing-forecast-actions-cell),
    .missing-forecast-table td:nth-child(2):not(.missing-forecast-actions-cell),
    .missing-forecast-table th:nth-child(1):not(.missing-forecast-actions-cell),
    .missing-forecast-table td:nth-child(1):not(.missing-forecast-actions-cell) {
      width: 5ch;
      min-width: 5ch;
      max-width: 5ch;
    }

    /* Assigned Resource column - nth-child(3) when Actions visible */
    .missing-forecast-table th:nth-child(3),
    .missing-forecast-table td:nth-child(3) {
      width: 20ch;
      min-width: 20ch;
      max-width: 20ch;
    }

    /* Project column - nth-child(4) when Actions visible */
    .missing-forecast-table th:nth-child(4),
    .missing-forecast-table td:nth-child(4) {
      width: 25ch;
      min-width: 25ch;
      max-width: 25ch;
    }

    /* Work Order Number column - nth-child(5) when Actions visible */
    .missing-forecast-table th:nth-child(5),
    .missing-forecast-table td:nth-child(5) {
      width: 30ch;
      min-width: 30ch;
      max-width: 30ch;
    }

    /* Est. Hours column - nth-child(6) when Actions visible */
    .missing-forecast-table th:nth-child(6),
    .missing-forecast-table td:nth-child(6) {
      width: 8ch;
      min-width: 8ch;
      max-width: 8ch;
    }

    .forecast-view-actions {
      margin: 0.25rem 0 0.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.6rem;
    }

    .display-filter-group {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .display-filter-label {
      margin: 0;
      font-size: 0.92rem;
      color: #334b68;
      font-weight: 600;
    }

    .display-filter-select {
      min-width: 14rem;
    }

    .forecast-export-btn {
      border: 1px solid #1f4d85;
      background: #1f4d85;
      color: #ffffff;
      border-radius: 0.5rem;
      padding: 0.45rem 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }

    .forecast-export-btn:hover {
      background: #173a64;
      border-color: #173a64;
    }

    .forecast-update-table-wrap {
      margin-top: 0.5rem;
      overflow-x: auto;
      border: 1px solid #d8e1ee;
      border-radius: 0.5rem;
      background: #ffffff;
    }

    .forecast-update-table {
      width: 100%;
      min-width: 150rem;
      border-collapse: collapse;
    }

    .forecast-update-table th {
      background: #eef4fb;
      color: #1a3f70;
      font-weight: 700;
      text-align: left;
      padding: 0.55rem 0.5rem;
      border-right: 1px solid #d8e1ee;
      white-space: nowrap;
    }

    .forecast-update-table td {
      border-top: 1px solid #d8e1ee;
      border-right: 1px solid #d8e1ee;
      padding: 0.45rem;
      white-space: nowrap;
    }

    .forecast-update-table td input,
    .forecast-update-table td select {
      min-width: 6.25rem;
      border: 1px solid #c4d5ea;
      border-radius: 0.35rem;
      padding: 0.35rem 0.45rem;
      font-size: 0.85rem;
      color: #10233f;
      background: #ffffff;
    }

    .forecast-update-table th:last-child,
    .forecast-update-table td:last-child {
      border-right: 0;
    }

    .update-actions-cell {
      display: flex;
      gap: 0.4rem;
    }

    .row-action-btn,
    .row-delete-btn {
      border-radius: 0.35rem;
      padding: 0.35rem 0.6rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }

    .row-action-btn {
      background: #1f4d85;
      color: #ffffff;
      border-color: #1f4d85;
    }

    .row-action-btn:hover {
      background: #173a64;
      border-color: #173a64;
    }

    .row-delete-btn {
      background: #fff3f2;
      color: #9c1e1e;
      border-color: #e4b4b1;
    }

    .row-delete-btn:hover {
      background: #fee6e4;
    }

    .row-action-btn:disabled,
    .row-delete-btn:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    .missing-forecast-actions-cell {
      white-space: nowrap;
    }

    @media (max-width: 900px) {
      .forecast-row {
        grid-template-columns: 1fr;
      }
    }
  `
})
export class PlannerPageComponent {
  readonly forecastRecords = signal<ForecastRecord[]>([]);
  readonly missingForecastRecords = signal<MissingForecastRecord[]>([]);
  readonly selectedViewFilterBy = signal<ForecastFilterBy>('');
  readonly selectedViewFilterValue = signal('');
  readonly availableViewFilterValues = computed(() => {
    const filterBy = this.selectedViewFilterBy();
    if (!filterBy) {
      return [] as string[];
    }

    const sourceRows =
      this.selectedViewDisplay() === 'missing forecast'
        ? this.missingForecastRecords()
        : this.forecastRecords();

    const values = sourceRows
      .map((row) => String((row as Record<string, unknown>)[filterBy] ?? '').trim())
      .filter((value) => value.length > 0);

    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  });
  readonly filteredForecastRecords = computed(() => {
    const rows = this.forecastRecords();
    const filterBy = this.selectedViewFilterBy();
    const filterValue = this.selectedViewFilterValue().trim();

    if (!filterBy || !filterValue) {
      return rows;
    }

    return rows.filter(
      (row) => String((row as Record<string, unknown>)[filterBy] ?? '').trim() === filterValue
    );
  });
  readonly filteredMissingForecastRecords = computed(() => {
    const rows = this.missingForecastRecords();
    const filterBy = this.selectedViewFilterBy();
    const filterValue = this.selectedViewFilterValue().trim();

    if (!filterBy || !filterValue) {
      return rows;
    }

    return rows.filter(
      (row) => String((row as Record<string, unknown>)[filterBy] ?? '').trim() === filterValue
    );
  });
  readonly updateForecastRecords = signal<ForecastRecord[]>([]);
  readonly isLoadingForecastRecords = signal(false);
  readonly isLoadingMissingForecastRecords = signal(false);
  readonly isLoadingUpdateForecastRecords = signal(false);
  readonly forecastViewError = signal('');
  readonly updateForecastError = signal('');
  readonly updateForecastSuccess = signal('');
  readonly updateForecastHazard = signal('');
  readonly updatingForecastId = signal<number | null>(null);
  readonly deletingForecastId = signal<number | null>(null);
  readonly selectedAction = signal<'Add Forecast' | 'View' | 'Update' | null>(null);
  readonly forecastAssignedResources = signal<string[]>([]);
  readonly selectedAssignedResource = signal('');
  readonly isLoadingAssignedResources = signal(false);
  readonly assignedResourcesError = signal('');
  readonly availableProjects = signal<string[]>([]);
  readonly selectedProject = signal('');
  readonly isLoadingProjects = signal(false);
  readonly projectsError = signal('');
  readonly availableWorkOrders = signal<string[]>([]);
  readonly selectedWorkOrder = signal('');
  readonly isLoadingWorkOrders = signal(false);
  readonly workOrdersError = signal('');
  readonly estimateValue = signal('');
  readonly startDateValue = signal('');
  readonly endDateValue = signal('');
  readonly pbsEstimateValue = signal('');
  readonly monthlyValues = signal<string[]>(Array(12).fill(''));
  readonly pbsAllocationError = signal('');
  readonly totalForecastedHours = computed(() => {
    const values = this.monthlyValues();
    const hasAnyInput = values.some((value) => String(value || '').trim().length > 0);

    if (!hasAnyInput) {
      return '';
    }

    const total = values.reduce((sum, value) => {
      const parsed = Number.parseFloat(String(value || '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0);

    return total.toFixed(2);
  });
  readonly totalForecastedHoursState = computed(() => {
    const totalDisplay = this.totalForecastedHours();
    if (!totalDisplay) {
      return '';
    }

    const total = Number.parseFloat(totalDisplay);
    const estimate = Number.parseFloat(String(this.estimateValue() || '').replace(/[^0-9.-]/g, ''));

    if (!Number.isFinite(total) || !Number.isFinite(estimate)) {
      return '';
    }

    return total <= estimate ? 'ok' : 'over';
  });
  readonly isLoadingEstimate = signal(false);
  readonly estimateError = signal('');
  readonly updateAssignedResources = signal<string[]>([]);
  readonly selectedUpdateAssignedResource = signal('');
  readonly isLoadingUpdateAssignedResources = signal(false);
  readonly updateAssignedResourcesError = signal('');
  readonly isSavingForecast = signal(false);
  readonly forecastSaveError = signal('');
  readonly forecastSaveHazard = signal('');
  readonly forecastSaveSuccess = signal('');
  readonly selectedViewDisplay = signal<'active forecast' | 'missing forecast'>('active forecast');
  readonly selectedUpdateFilterBy = signal<ForecastFilterBy>('');
  readonly selectedUpdateFilterValue = signal('');
  readonly availableUpdateFilterValues = computed(() => {
    const filterBy = this.selectedUpdateFilterBy();
    if (!filterBy) {
      return [] as string[];
    }

    const values = this.updateForecastRecords()
      .map((row) => String((row as Record<string, unknown>)[filterBy] ?? '').trim())
      .filter((value) => value.length > 0);

    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  });
  readonly filteredUpdateForecastRecords = computed(() => {
    const rows = this.updateForecastRecords();
    const filterBy = this.selectedUpdateFilterBy();
    const filterValue = this.selectedUpdateFilterValue().trim();

    if (!filterBy || !filterValue) {
      return rows;
    }

    return rows.filter(
      (row) => String((row as Record<string, unknown>)[filterBy] ?? '').trim() === filterValue
    );
  });

  private readonly authService = inject(AuthService);
  readonly isPractitionerViewOnly = computed(() => this.authService.isPractitioner());

  constructor() {
    if (this.authService.isPractitioner()) {
      this.selectedAction.set('View');
    }
  }

  setAction(action: 'Add Forecast' | 'View' | 'Update'): void {
    this.selectedAction.set(action);

    if (action === 'Add Forecast') {
      this.forecastViewError.set('');
      this.selectedAssignedResource.set('');
      this.selectedProject.set('');
      this.availableProjects.set([]);
      this.projectsError.set('');
      this.selectedWorkOrder.set('');
      this.availableWorkOrders.set([]);
      this.workOrdersError.set('');
      this.estimateValue.set('');
      this.startDateValue.set('');
      this.endDateValue.set('');
      this.pbsEstimateValue.set('');
      this.monthlyValues.set(Array(12).fill(''));
      this.pbsAllocationError.set('');
      this.estimateError.set('');
      this.selectedUpdateAssignedResource.set('');
      this.updateAssignedResourcesError.set('');
      void this.loadForecastAssignedResources();
      return;
    }

    if (action === 'Update') {
      this.forecastViewError.set('');
      this.updateForecastError.set('');
      this.updateForecastSuccess.set('');
      this.updateForecastHazard.set('');
      this.selectedUpdateFilterBy.set('');
      this.selectedUpdateFilterValue.set('');
      this.selectedAssignedResource.set('');
      this.selectedProject.set('');
      this.availableProjects.set([]);
      this.projectsError.set('');
      this.selectedWorkOrder.set('');
      this.availableWorkOrders.set([]);
      this.workOrdersError.set('');
      this.estimateValue.set('');
      this.startDateValue.set('');
      this.endDateValue.set('');
      this.pbsEstimateValue.set('');
      this.monthlyValues.set(Array(12).fill(''));
      this.pbsAllocationError.set('');
      this.estimateError.set('');
      this.assignedResourcesError.set('');
      this.selectedUpdateAssignedResource.set('');
      void this.loadUpdateForecastRecords();
      return;
    }

    if (action === 'View') {
      this.selectedViewDisplay.set('active forecast');
      this.assignedResourcesError.set('');
      this.selectedAssignedResource.set('');
      this.selectedProject.set('');
      this.availableProjects.set([]);
      this.projectsError.set('');
      this.selectedWorkOrder.set('');
      this.availableWorkOrders.set([]);
      this.workOrdersError.set('');
      this.estimateValue.set('');
      this.startDateValue.set('');
      this.endDateValue.set('');
      this.pbsEstimateValue.set('');
      this.monthlyValues.set(Array(12).fill(''));
      this.pbsAllocationError.set('');
      this.estimateError.set('');
      this.updateAssignedResourcesError.set('');
      this.selectedUpdateAssignedResource.set('');
      this.forecastSaveError.set('');
      this.forecastSaveHazard.set('');
      this.forecastSaveSuccess.set('');
      void this.loadForecastRecords();
      return;
    }

    this.assignedResourcesError.set('');
    this.selectedAssignedResource.set('');
    this.selectedProject.set('');
    this.availableProjects.set([]);
    this.projectsError.set('');
    this.selectedWorkOrder.set('');
    this.availableWorkOrders.set([]);
    this.workOrdersError.set('');
    this.estimateValue.set('');
    this.startDateValue.set('');
    this.endDateValue.set('');
    this.pbsEstimateValue.set('');
    this.monthlyValues.set(Array(12).fill(''));
    this.pbsAllocationError.set('');
    this.estimateError.set('');
    this.updateAssignedResourcesError.set('');
    this.selectedUpdateAssignedResource.set('');
    this.forecastViewError.set('');
  }

  onAssignedResourceChange(nextValue: string): void {
    const normalizedAssignedResource = String(nextValue || '').trim();
    this.selectedAssignedResource.set(normalizedAssignedResource);
    this.selectedProject.set('');
    this.availableProjects.set([]);
    this.projectsError.set('');
    this.selectedWorkOrder.set('');
    this.availableWorkOrders.set([]);
    this.workOrdersError.set('');
    this.estimateValue.set('');
    this.startDateValue.set('');
    this.endDateValue.set('');
    this.pbsEstimateValue.set('');
    this.monthlyValues.set(Array(12).fill(''));
    this.pbsAllocationError.set('');
    this.estimateError.set('');

    if (!normalizedAssignedResource) {
      return;
    }

    void this.loadProjectsForAssignedResource(normalizedAssignedResource);
  }

  onProjectChange(nextValue: string): void {
    const normalizedProject = String(nextValue || '').trim();
    this.selectedProject.set(normalizedProject);
    this.selectedWorkOrder.set('');
    this.availableWorkOrders.set([]);
    this.workOrdersError.set('');
    this.estimateValue.set('');
    this.startDateValue.set('');
    this.endDateValue.set('');
    this.pbsEstimateValue.set('');
    this.monthlyValues.set(Array(12).fill(''));
    this.pbsAllocationError.set('');
    this.estimateError.set('');

    if (!normalizedProject || !this.selectedAssignedResource()) {
      return;
    }

    void this.loadWorkOrdersForSelection(this.selectedAssignedResource(), normalizedProject);
  }

  onWorkOrderChange(nextValue: string): void {
    const normalizedWorkOrder = String(nextValue || '').trim();
    this.selectedWorkOrder.set(normalizedWorkOrder);
    this.estimateValue.set('');
    this.startDateValue.set('');
    this.endDateValue.set('');
    this.pbsEstimateValue.set('');
    this.monthlyValues.set(Array(12).fill(''));
    this.pbsAllocationError.set('');
    this.estimateError.set('');

    if (!normalizedWorkOrder || !this.selectedAssignedResource() || !this.selectedProject()) {
      return;
    }

    void this.loadEstimateForSelection(
      this.selectedAssignedResource(),
      this.selectedProject(),
      normalizedWorkOrder
    );
  }

  onUpdateAssignedResourceChange(nextValue: string): void {
    this.selectedUpdateAssignedResource.set(String(nextValue || '').trim());
  }

  onUpdateForecastFieldInput(rowId: number, field: keyof ForecastRecord, nextValue: string): void {
    const currentRows = [...this.updateForecastRecords()];
    const idx = currentRows.findIndex((r) => r.id === rowId);
    if (idx === -1) {
      return;
    }

    const row = currentRows[idx];
    if (!row) {
      return;
    }

    if (field === 'id' || field === 'createdAt' || field === 'updatedAt') {
      return;
    }

    (row as Record<string, unknown>)[field] = String(nextValue ?? '').trim();
    currentRows[idx] = { ...row };
    this.updateForecastRecords.set(currentRows);
  }

  onUpdateForecastRow(rowId: number): void {
    const idx = this.updateForecastRecords().findIndex((r) => r.id === rowId);
    if (idx !== -1) {
      void this.updateForecastRow(idx);
    }
  }

  onDeleteForecastRow(rowId: number): void {
    const idx = this.updateForecastRecords().findIndex((r) => r.id === rowId);
    if (idx !== -1) {
      void this.deleteForecastRow(idx);
    }
  }

  onPbsEstimateChange(nextValue: string): void {
    const normalizedValue = String(nextValue || '').trim();
    this.pbsEstimateValue.set(normalizedValue);

    if (normalizedValue === 'Yes') {
      this.applyPbsEvenAllocation();
      return;
    }

    if (normalizedValue === 'No') {
      this.monthlyValues.set(Array(12).fill(''));
      this.pbsAllocationError.set('');
    }
  }

  onMonthlyValueInput(monthIndex: number, nextValue: string): void {
    const current = [...this.monthlyValues()];
    current[monthIndex] = String(nextValue ?? '').trim();
    this.monthlyValues.set(current);
  }

  onSaveForecast(): void {
    void this.saveForecast();
  }

  onViewDisplayChange(nextValue: string): void {
    const normalized = String(nextValue || '').trim().toLowerCase();
    const display =
      normalized === 'missing forecast' ? 'missing forecast' : 'active forecast';

    this.selectedViewDisplay.set(display);
    this.selectedViewFilterBy.set('');
    this.selectedViewFilterValue.set('');
    this.forecastViewError.set('');

    if (display === 'missing forecast') {
      void this.loadMissingForecastRecords();
      return;
    }

    void this.loadForecastRecords();
  }

  onViewFilterByChange(nextValue: string): void {
    const normalized = String(nextValue || '').trim();
    const filterBy: ForecastFilterBy =
      normalized === 'projectName' ||
      normalized === 'workOrderNumber' ||
      normalized === 'assignedResource'
        ? normalized
        : '';

    this.selectedViewFilterBy.set(filterBy);
    this.selectedViewFilterValue.set('');
  }

  onViewFilterValueChange(nextValue: string): void {
    this.selectedViewFilterValue.set(String(nextValue || '').trim());
  }

  onUpdateFilterByChange(nextValue: string): void {
    const normalized = String(nextValue || '').trim();
    const filterBy: ForecastFilterBy =
      normalized === 'projectName' ||
      normalized === 'workOrderNumber' ||
      normalized === 'assignedResource'
        ? normalized
        : '';

    this.selectedUpdateFilterBy.set(filterBy);
    this.selectedUpdateFilterValue.set('');
  }

  onUpdateFilterValueChange(nextValue: string): void {
    this.selectedUpdateFilterValue.set(String(nextValue || '').trim());
  }

  onAddForecastFromMissing(row: MissingForecastRecord): void {
    void this.addForecastFromMissingRow(row);
  }

  private async loadForecastAssignedResources(): Promise<void> {
    this.isLoadingAssignedResources.set(true);
    this.assignedResourcesError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/forecast-assigned-resources`);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.assignedResourcesError.set(
          errorBody.message || 'Unable to load assigned resources for forecast.'
        );
        this.forecastAssignedResources.set([]);
        return;
      }

      const result = (await response.json()) as { resources?: string[] };
      this.forecastAssignedResources.set(result.resources ?? []);
    } catch {
      this.assignedResourcesError.set('Unable to load assigned resources for forecast.');
      this.forecastAssignedResources.set([]);
    } finally {
      this.isLoadingAssignedResources.set(false);
    }
  }

  private async addForecastFromMissingRow(row: MissingForecastRecord): Promise<void> {
    const assignedResource = String(row.assignedResource || '').trim();
    const projectName = String(row.projectName || '').trim();
    const workOrderNumber = String(row.workOrderNumber || '').trim();

    this.setAction('Add Forecast');

    if (assignedResource) {
      await this.loadProjectsForAssignedResource(assignedResource);
      const resources = this.forecastAssignedResources();
      if (!resources.includes(assignedResource)) {
        this.forecastAssignedResources.set([...resources, assignedResource].sort((a, b) => a.localeCompare(b)));
      }
      this.selectedAssignedResource.set(assignedResource);
    }

    if (assignedResource && projectName) {
      const projects = this.availableProjects();
      if (!projects.includes(projectName)) {
        this.availableProjects.set([...projects, projectName].sort((a, b) => a.localeCompare(b)));
      }
      this.selectedProject.set(projectName);
      await this.loadWorkOrdersForSelection(assignedResource, projectName);
    }

    if (assignedResource && projectName && workOrderNumber) {
      const workOrders = this.availableWorkOrders();
      if (!workOrders.includes(workOrderNumber)) {
        this.availableWorkOrders.set([...workOrders, workOrderNumber].sort((a, b) => a.localeCompare(b)));
      }
      this.selectedWorkOrder.set(workOrderNumber);
      await this.loadEstimateForSelection(assignedResource, projectName, workOrderNumber);
      return;
    }

    this.estimateValue.set(String(row.estimatedHours ?? '').trim());
    this.startDateValue.set(String(row.startDate || '').trim());
    this.endDateValue.set(String(row.endDate || '').trim());
  }

  private async loadUpdateAssignedResources(): Promise<void> {
    this.isLoadingUpdateAssignedResources.set(true);
    this.updateAssignedResourcesError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/forecast-update-assigned-resources`);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.updateAssignedResourcesError.set(
          errorBody.message || 'Unable to load assigned resources for update.'
        );
        this.updateAssignedResources.set([]);
        return;
      }

      const result = (await response.json()) as { resources?: string[] };
      this.updateAssignedResources.set(result.resources ?? []);
    } catch {
      this.updateAssignedResourcesError.set('Unable to load assigned resources for update.');
      this.updateAssignedResources.set([]);
    } finally {
      this.isLoadingUpdateAssignedResources.set(false);
    }
  }

  private async loadForecastRecords(): Promise<void> {
    this.isLoadingForecastRecords.set(true);
    this.forecastViewError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/forecast`);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.forecastViewError.set(errorBody.message || 'Unable to load forecast records.');
        this.forecastRecords.set([]);
        return;
      }

      const result = (await response.json()) as { forecasts?: ForecastRecord[] };

      this.forecastRecords.set(result.forecasts ?? []);
    } catch {
      this.forecastViewError.set('Unable to load forecast records.');
      this.forecastRecords.set([]);
    } finally {
      this.isLoadingForecastRecords.set(false);
    }
  }

  private async loadMissingForecastRecords(): Promise<void> {
    this.isLoadingMissingForecastRecords.set(true);
    this.forecastViewError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/forecast-missing`);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.forecastViewError.set(
          errorBody.message || 'Unable to load missing forecast records.'
        );
        this.missingForecastRecords.set([]);
        return;
      }

      const result = (await response.json()) as { missingForecasts?: MissingForecastRecord[] };
      this.missingForecastRecords.set(result.missingForecasts ?? []);
    } catch {
      this.forecastViewError.set('Unable to load missing forecast records.');
      this.missingForecastRecords.set([]);
    } finally {
      this.isLoadingMissingForecastRecords.set(false);
    }
  }

  private async loadUpdateForecastRecords(): Promise<void> {
    this.isLoadingUpdateForecastRecords.set(true);
    this.updateForecastError.set('');

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/forecast`);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.updateForecastError.set(errorBody.message || 'Unable to load forecast records for update.');
        this.updateForecastRecords.set([]);
        return;
      }

      const result = (await response.json()) as { forecasts?: ForecastRecord[] };
      this.updateForecastRecords.set(result.forecasts ?? []);
    } catch {
      this.updateForecastError.set('Unable to load forecast records for update.');
      this.updateForecastRecords.set([]);
    } finally {
      this.isLoadingUpdateForecastRecords.set(false);
    }
  }

  private buildUpdatePayload(row: ForecastRecord): Record<string, string | number> {
    return {
      assignedResource: row.assignedResource,
      projectName: row.projectName,
      workOrderNumber: row.workOrderNumber,
      estimate: row.estimate,
      startDate: row.startDate,
      endDate: row.endDate,
      pbsEstHours: row.pbsEstHours,
      totalForecastedHours: row.totalForecastedHours,
      janHours: row.janHours,
      febHours: row.febHours,
      marHours: row.marHours,
      aprHours: row.aprHours,
      mayHours: row.mayHours,
      junHours: row.junHours,
      julHours: row.julHours,
      augHours: row.augHours,
      sepHours: row.sepHours,
      octHours: row.octHours,
      novHours: row.novHours,
      decHours: row.decHours,
    };
  }

  private async updateForecastRow(rowIndex: number): Promise<void> {
    this.updateForecastError.set('');
    this.updateForecastSuccess.set('');
    this.updateForecastHazard.set('');

    const row = this.updateForecastRecords()[rowIndex];
    if (!row) {
      return;
    }

    this.updatingForecastId.set(row.id);
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/forecast/${row.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.authService.authorizationHeader(),
        },
        body: JSON.stringify(this.buildUpdatePayload(row)),
      });

      const result = (await response.json().catch(() => ({}))) as { message?: string; code?: string };

      if (!response.ok) {
        if (response.status === 409 || result.code === 'FORECAST_EXISTS') {
          this.updateForecastHazard.set(this.normalizeHazardMessage(result.message || 'Forecast already exists.'));
          return;
        }

        this.updateForecastError.set(result.message || 'Unable to update forecast entry.');
        return;
      }

      this.updateForecastSuccess.set(`Forecast entry ${row.id} updated successfully.`);
      void this.loadForecastRecords();
    } catch {
      this.updateForecastError.set('Unable to update forecast entry.');
    } finally {
      this.updatingForecastId.set(null);
    }
  }

  private async deleteForecastRow(rowIndex: number): Promise<void> {
    this.updateForecastError.set('');
    this.updateForecastSuccess.set('');
    this.updateForecastHazard.set('');

    const row = this.updateForecastRecords()[rowIndex];
    if (!row) {
      return;
    }

    this.deletingForecastId.set(row.id);
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/forecast/${row.id}`, {
        method: 'DELETE',
        headers: { ...this.authService.authorizationHeader() },
      });

      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        this.updateForecastError.set(result.message || 'Unable to delete forecast entry.');
        return;
      }

      const rows = [...this.updateForecastRecords()];
      rows.splice(rowIndex, 1);
      this.updateForecastRecords.set(rows);
      this.updateForecastSuccess.set(`Forecast entry ${row.id} deleted successfully.`);
      void this.loadForecastRecords();
    } catch {
      this.updateForecastError.set('Unable to delete forecast entry.');
    } finally {
      this.deletingForecastId.set(null);
    }
  }

  private async loadProjectsForAssignedResource(resourceAssigned: string): Promise<void> {
    this.isLoadingProjects.set(true);
    this.projectsError.set('');

    try {
      const query = encodeURIComponent(resourceAssigned);
      const response = await fetch(
        `${this.getApiBaseUrl()}/api/project-orders?resourceAssigned=${query}`
      );

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.projectsError.set(errorBody.message || 'Unable to load projects for selected resource.');
        this.availableProjects.set([]);
        return;
      }

      const result = (await response.json()) as { projectNames?: string[] };
      this.availableProjects.set(result.projectNames ?? []);
    } catch {
      this.projectsError.set('Unable to load projects for selected resource.');
      this.availableProjects.set([]);
    } finally {
      this.isLoadingProjects.set(false);
    }
  }

  private async loadWorkOrdersForSelection(
    resourceAssigned: string,
    projectName: string
  ): Promise<void> {
    this.isLoadingWorkOrders.set(true);
    this.workOrdersError.set('');

    try {
      const resourceQuery = encodeURIComponent(resourceAssigned);
      const projectQuery = encodeURIComponent(projectName);
      const response = await fetch(
        `${this.getApiBaseUrl()}/api/project-work-orders?resourceAssigned=${resourceQuery}&projectName=${projectQuery}`
      );

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.workOrdersError.set(
          errorBody.message || 'Unable to load work orders for selected project.'
        );
        this.availableWorkOrders.set([]);
        return;
      }

      const result = (await response.json()) as { workOrders?: string[] };
      this.availableWorkOrders.set(result.workOrders ?? []);
    } catch {
      this.workOrdersError.set('Unable to load work orders for selected project.');
      this.availableWorkOrders.set([]);
    } finally {
      this.isLoadingWorkOrders.set(false);
    }
  }

  private async loadEstimateForSelection(
    resourceAssigned: string,
    projectName: string,
    workOrderNumber: string
  ): Promise<void> {
    this.isLoadingEstimate.set(true);
    this.estimateError.set('');

    try {
      const resourceQuery = encodeURIComponent(resourceAssigned);
      const projectQuery = encodeURIComponent(projectName);
      const workOrderQuery = encodeURIComponent(workOrderNumber);
      const response = await fetch(
        `${this.getApiBaseUrl()}/api/project-work-order-estimate?resourceAssigned=${resourceQuery}&projectName=${projectQuery}&workOrderNumber=${workOrderQuery}`
      );

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        this.estimateError.set(errorBody.message || 'Unable to load estimate for selected work order.');
        this.estimateValue.set('');
        this.startDateValue.set('');
        this.endDateValue.set('');
        return;
      }

      const result = (await response.json()) as {
        estimate?: string;
        projectStartDate?: string;
        projectEndDate?: string;
      };
      this.estimateValue.set(String(result.estimate || '').trim());
      this.startDateValue.set(String(result.projectStartDate || '').trim());
      this.endDateValue.set(String(result.projectEndDate || '').trim());

      if (this.pbsEstimateValue() === 'Yes') {
        this.applyPbsEvenAllocation();
      }
    } catch {
      this.estimateError.set('Unable to load estimate for selected work order.');
      this.estimateValue.set('');
      this.startDateValue.set('');
      this.endDateValue.set('');
    } finally {
      this.isLoadingEstimate.set(false);
    }
  }

  private applyPbsEvenAllocation(): void {
    this.pbsAllocationError.set('');

    const startDateRaw = this.startDateValue();
    const endDateRaw = this.endDateValue();
    const estimateRaw = this.estimateValue();

    if (!startDateRaw || !endDateRaw || !estimateRaw) {
      return;
    }

    const forecastYear = this.deriveYearFromStartDate(startDateRaw);
    if (!forecastYear) {
      this.pbsAllocationError.set('Unable to apply PBS hours. Start Date must be valid.');
      return;
    }

    const startDate = new Date(startDateRaw);
    const endDate = new Date(endDateRaw);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      this.pbsAllocationError.set('Unable to apply PBS hours. Check Start Date and End Date.');
      return;
    }

    const parsedEstimate = Number.parseFloat(String(estimateRaw).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(parsedEstimate)) {
      this.pbsAllocationError.set('Unable to apply PBS hours. Estimate must be numeric.');
      return;
    }

    const includedMonths: number[] = [];
    for (let month = 0; month < 12; month += 1) {
      const monthStart = new Date(forecastYear, month, 1);
      const monthEnd = new Date(forecastYear, month + 1, 0);

      if (monthStart <= endDate && monthEnd >= startDate) {
        includedMonths.push(month);
      }
    }

    if (includedMonths.length === 0) {
      this.pbsAllocationError.set('No overlapping months found in the forecast period year.');
      this.monthlyValues.set(Array(12).fill(''));
      return;
    }

    const evenValue = (parsedEstimate / includedMonths.length).toFixed(2);
    const nextValues = Array(12).fill('');
    for (const month of includedMonths) {
      nextValues[month] = evenValue;
    }

    this.monthlyValues.set(nextValues);
  }

  private deriveYearFromStartDate(startDateRaw: string): number | null {
    const normalized = String(startDateRaw || '').trim();
    const match = normalized.match(/^(\d{4})-\d{2}-\d{2}$/);
    if (!match) {
      return null;
    }

    const parsed = Number.parseInt(match[1], 10);
    return Number.isInteger(parsed) ? parsed : null;
  }

  private async saveForecast(): Promise<void> {
    this.forecastSaveError.set('');
    this.forecastSaveHazard.set('');
    this.forecastSaveSuccess.set('');

    const assignedResource = this.selectedAssignedResource().trim();
    const projectName = this.selectedProject().trim();
    const workOrderNumber = this.selectedWorkOrder().trim();
    const startDate = this.startDateValue().trim();
    const endDate = this.endDateValue().trim();

    if (!assignedResource || !projectName || !workOrderNumber || !startDate) {
      this.forecastSaveError.set(
        'Assigned Resource, Project, Work Order Number, and Start Date are required to save.'
      );
      return;
    }

    const derivedYear = this.deriveYearFromStartDate(startDate);
    if (!derivedYear) {
      this.forecastSaveError.set('Start Date must be a valid date in YYYY-MM-DD format.');
      return;
    }

    const monthValues = this.monthlyValues();
    const payload = {
      assignedResource,
      projectName,
      workOrderNumber,
      estimate: this.estimateValue(),
      startDate,
      endDate,
      pbsEstHours: this.pbsEstimateValue(),
      totalForecastedHours: this.totalForecastedHours(),
      janHours: monthValues[0] || '',
      febHours: monthValues[1] || '',
      marHours: monthValues[2] || '',
      aprHours: monthValues[3] || '',
      mayHours: monthValues[4] || '',
      junHours: monthValues[5] || '',
      julHours: monthValues[6] || '',
      augHours: monthValues[7] || '',
      sepHours: monthValues[8] || '',
      octHours: monthValues[9] || '',
      novHours: monthValues[10] || '',
      decHours: monthValues[11] || '',
    };

    this.isSavingForecast.set(true);
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/forecast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authService.authorizationHeader(),
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
      };

      if (!response.ok) {
        if (response.status === 409 || result.code === 'FORECAST_EXISTS') {
          this.forecastSaveHazard.set(
            this.normalizeHazardMessage(
              result.message ||
              'Hazard: A forecast already exists for this Assigned Resource, Project, and Work Order Number. Use Update to modify the forecast.'
            )
          );
          return;
        }

        this.forecastSaveError.set(result.message || 'Unable to save forecast entry.');
        return;
      }

      this.forecastSaveSuccess.set('Forecast saved successfully.');
    } catch {
      this.forecastSaveError.set('Unable to save forecast entry.');
    } finally {
      this.isSavingForecast.set(false);
    }
  }

  private normalizeHazardMessage(message: string): string {
    return String(message || '')
      .replace(/^hazard\s*:\s*/i, '')
      .trim();
  }

  exportForecastToExcel(): void {
    const rows = this.filteredForecastRecords();
    if (rows.length === 0) {
      return;
    }

    const headers = [
      'ID',
      'Assigned Resource',
      'Project',
      'Work Order Number',
      'Start Date',
      'End Date',
      'Estimate',
      'Fcst Hrs',
      'Variance',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    const toCell = (value: unknown) => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();

    const lines = [headers.join('\t')];
    for (const row of rows) {
      const variance = this.formatVariance(this.calculateVariance(row));
      lines.push(
        [
          toCell(row.id),
          toCell(row.assignedResource),
          toCell(row.projectName),
          toCell(row.workOrderNumber),
          toCell(row.startDate),
          toCell(row.endDate),
          toCell(row.estimate),
          toCell(row.totalForecastedHours),
          toCell(variance),
          toCell(row.janHours),
          toCell(row.febHours),
          toCell(row.marHours),
          toCell(row.aprHours),
          toCell(row.mayHours),
          toCell(row.junHours),
          toCell(row.julHours),
          toCell(row.augHours),
          toCell(row.sepHours),
          toCell(row.octHours),
          toCell(row.novHours),
          toCell(row.decHours),
        ].join('\t')
      );
    }

    const content = lines.join('\n');
    const blob = new Blob([content], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    anchor.href = url;
    anchor.download = `resource-forecast-view-${timestamp}.xls`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  calculateVariance(row: { estimate: number; totalForecastedHours: number }): number {
    const estimate = Number.parseFloat(String(row.estimate ?? '0'));
    const forecastHours = Number.parseFloat(String(row.totalForecastedHours ?? '0'));
    const safeEstimate = Number.isFinite(estimate) ? estimate : 0;
    const safeForecastHours = Number.isFinite(forecastHours) ? forecastHours : 0;

    return safeEstimate - safeForecastHours;
  }

  formatVariance(value: number): string {
    return Number.isFinite(value) ? value.toFixed(2) : '0.00';
  }

  private getApiBaseUrl(): string {
    return resolveApiBaseUrl();
  }

}
