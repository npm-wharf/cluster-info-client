# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.0.3](https://github.com/npm-wharf/cluster-info-client/compare/v2.0.2...v2.0.3) (2019-07-12)


### Bug Fixes

* auth before ensuring cluster exists ([ac2c411](https://github.com/npm-wharf/cluster-info-client/commit/ac2c411))



## [2.0.2](https://github.com/npm-wharf/cluster-info-client/compare/v2.0.1...v2.0.2) (2019-07-12)


### Bug Fixes

* username is actually user in the schema ([bb5e4b8](https://github.com/npm-wharf/cluster-info-client/commit/bb5e4b8))



## [2.0.1](https://github.com/npm-wharf/cluster-info-client/compare/v2.0.0...v2.0.1) (2019-07-10)


### Bug Fixes

* allow 'dev' as an environment ([a4597d2](https://github.com/npm-wharf/cluster-info-client/commit/a4597d2))



## [1.9.1](https://github.com/npm-wharf/cluster-info-client/compare/v1.9.0...v1.9.1) (2019-07-09)


### Bug Fixes

* **schema:** remove redundant common projectNumber property ([322c498](https://github.com/npm-wharf/cluster-info-client/commit/322c498))



# [1.9.0](https://github.com/npm-wharf/cluster-info-client/compare/v1.8.1...v1.9.0) (2019-06-27)


### Features

* add schema for cluster-info data ([#9](https://github.com/npm-wharf/cluster-info-client/issues/9)) ([1171ef4](https://github.com/npm-wharf/cluster-info-client/commit/1171ef4))



## [1.8.1](https://github.com/npm-wharf/cluster-info-client/compare/v1.8.0...v1.8.1) (2019-06-21)


### Bug Fixes

* workaround for stack overflow bug ([6d660fc](https://github.com/npm-wharf/cluster-info-client/commit/6d660fc))



# [1.8.0](https://github.com/npm-wharf/cluster-info-client/compare/v1.7.1...v1.8.0) (2019-06-05)


### Features

* idempotent adding of service accounts ([db7ac42](https://github.com/npm-wharf/cluster-info-client/commit/db7ac42))



## [1.7.1](https://github.com/npm-wharf/cluster-info-client/compare/v1.7.0...v1.7.1) (2019-06-04)


### Bug Fixes

* **docs:** parameter name ([84b1cf2](https://github.com/npm-wharf/cluster-info-client/commit/84b1cf2))
* await approle before issueing cert ([ac64d9b](https://github.com/npm-wharf/cluster-info-client/commit/ac64d9b))



# [1.7.0](https://github.com/npm-wharf/cluster-info-client/compare/v1.6.0...v1.7.0) (2019-05-31)


### Features

* add issueCertificate ([55ff8ab](https://github.com/npm-wharf/cluster-info-client/commit/55ff8ab))



# [1.6.0](https://github.com/npm-wharf/cluster-info-client/compare/v1.5.0...v1.6.0) (2019-05-04)


### Features

* approle support ([6436aa8](https://github.com/npm-wharf/cluster-info-client/commit/6436aa8))



# [1.5.0](https://github.com/npm-wharf/cluster-info-client/compare/v1.4.2...v1.5.0) (2019-05-01)


### Features

* add listClustersByChannel ([d963404](https://github.com/npm-wharf/cluster-info-client/commit/d963404))



## [1.4.2](https://github.com/npm-wharf/cluster-info-client/compare/v1.4.1...v1.4.2) (2019-04-26)


### Bug Fixes

* dont write data to vault if its the same ([1f6ffa8](https://github.com/npm-wharf/cluster-info-client/commit/1f6ffa8))



## [1.4.1](https://github.com/npm-wharf/cluster-info-client/compare/v1.4.0...v1.4.1) (2019-04-23)



# [1.4.0](https://github.com/npm-wharf/cluster-info-client/compare/v1.3.0...v1.4.0) (2019-04-11)


### Features

* add getCommon method for defaults among providers ([#7](https://github.com/npm-wharf/cluster-info-client/issues/7)) ([604567b](https://github.com/npm-wharf/cluster-info-client/commit/604567b))



# [1.3.0](https://github.com/npm-wharf/cluster-info-client/compare/v1.2.0...v1.3.0) (2019-04-06)


### Features

* make vault-prefix configurable ([#5](https://github.com/npm-wharf/cluster-info-client/issues/5)) ([77dd1e9](https://github.com/npm-wharf/cluster-info-client/commit/77dd1e9))



# [1.2.0](https://github.com/npm-wharf/cluster-info-client/compare/v1.1.0...v1.2.0) (2019-04-04)


### Features

* initial implementation ([#2](https://github.com/npm-wharf/cluster-info-client/issues/2)) ([4482bf4](https://github.com/npm-wharf/cluster-info-client/commit/4482bf4))
* store secrets in vault ([#3](https://github.com/npm-wharf/cluster-info-client/issues/3)) ([02805a9](https://github.com/npm-wharf/cluster-info-client/commit/02805a9))
* Store service accounts in vault ([#4](https://github.com/npm-wharf/cluster-info-client/issues/4)) ([d2f4ce2](https://github.com/npm-wharf/cluster-info-client/commit/d2f4ce2))



# 1.1.0 (2019-03-22)


### Features

* initial implementation ([a652304](https://github.com/npm-wharf/cluster-info-client/commit/a652304))
