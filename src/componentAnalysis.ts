/* --------------------------------------------------------------------------------------------
 * Copyright (c) Red Hat
 * Licensed under the Apache-2.0 License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { globalSettings, connection } from './server';
import { config } from './config';
import { isDefined } from './utils';

import exhort from '@RHEcosystemAppEng/exhort-javascript-api';

/* Source specification */
interface ISource {
    id: string;
    dependencies: any[];
}

class Source implements ISource {
    constructor(
        public id: string, 
        public dependencies: any[]
    ) {}
}

/* Dependency Data specification */
interface IDependencyData {
    sourceId: string;
    issuesCount: number;
    highestVulnerabilitySeverity: string;
}

class DependencyData implements IDependencyData {
    constructor(
        public sourceId: string,
        public issuesCount: number,
        public highestVulnerabilitySeverity: string
    ) {}
}

/* Dependency Analysis Response specification */
interface IAnalysisResponse {
    dependencies: Map<string, DependencyData[]>;
}

class AnalysisResponse implements IAnalysisResponse {
    dependencies: Map<string, DependencyData[]> = new Map<string, DependencyData[]>();

    constructor(resData: exhort.AnalysisReport) {

        const failedProviders: string[] = [];
        const sources: Source[] = [];
        
        if (isDefined(resData, 'providers')) {
            Object.entries(resData.providers).map(([providerName, providerData]) => {
                if (isDefined(providerData, 'status', 'ok') && isDefined(providerData, 'sources') && providerData.status.ok) {
                    Object.entries(providerData.sources).map(([sourceName, sourceData]) => {
                        this.sources.push(new Source(`${providerName}-${sourceName}`, isDefined(providerData, 'dependencies') ? sourceData.dependencies : []))
                    });
                } else {
                    failedProviders.push(providerName);
                }
            });

            if (failedProviders) {
                const errMsg = `The component analysis couldn't fetch data from the following providers: [${failedProviders}]`;
                connection.console.warn(errMsg);
                connection.sendNotification('caSimpleWarning', errMsg);
            }

            sources.forEach(source => {
                source.dependencies.forEach(d => {
                    if (isDefined(d, 'ref') && isDefined(d, 'issues')) {
                        const dd = new DependencyData(source.id, d.issues.length, isDefined(d, 'highestVulnerability', 'severity') ? d.highestVulnerability.severity : 'UNKNOWN');
                        if (this.dependencies[d.ref] == undefined) {
                            this.dependencies[d.ref] = [];
                        }
                        this.dependencies[d.ref].push(dd)
                    }
                });
            })
        }
    }
}

async function componentAnalysisService (fileType: string, contents: string): Promise<AnalysisResponse> {
    
    // set up configuration options for the component analysis request
    const options = {
        'RHDA_TOKEN': config.telemetryId,
        'RHDA_SOURCE': config.utmSource,
        'EXHORT_DEV_MODE': config.exhortDevMode,
        'MATCH_MANIFEST_VERSIONS': globalSettings.matchManifestVersions,
        'EXHORT_MVN_PATH': globalSettings.exhortMvnPath,
        'EXHORT_NPM_PATH': globalSettings.exhortNpmPath,
        'EXHORT_GO_PATH': globalSettings.exhortGoPath,
        'EXHORT_PYTHON3_PATH': globalSettings.exhortPython3Path,
        'EXHORT_PIP3_PATH': globalSettings.exhortPip3Path,
        'EXHORT_PYTHON_PATH': globalSettings.exhortPythonPath,
        'EXHORT_PIP_PATH': globalSettings.exhortPipPath
    };
    if (globalSettings.exhortSnykToken !== '') {
        options['EXHORT_SNYK_TOKEN'] = globalSettings.exhortSnykToken;
    }

    // get component analysis as JSON object
    const componentAnalysisJson = await exhort.componentAnalysis(fileType, contents, options);

    return new AnalysisResponse(componentAnalysisJson);
};

export { componentAnalysisService, DependencyData }