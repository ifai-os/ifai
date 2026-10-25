import { DraftPanel as DraftPanel_5d90df983563fe7b2e57964307e17b7f } from '../../../modules/apps/admin/draft-panel'
import { HeatPanel as HeatPanel_e2e4e5526093090dcc57b08478fbf79e } from '../../../modules/apps/admin/heat-panel'
import { ReviewsPanel as ReviewsPanel_f4f5fdac6b8d91f90b15d4d825cc5936 } from '../../../modules/apps/admin/reviews-panel'
import { ReportsPanel as ReportsPanel_975fa451eb12132dcbc946d9eb2f8112 } from '../../../modules/apps/admin/reports-panel'
import { HeatStatus as HeatStatus_f910cd358bdcc46e0c7fb035c893c100 } from '../../../modules/apps/admin/heat-status'
import { ReviewReports as ReviewReports_8e96545e70b9997208c5ec0c15febf45 } from '../../../modules/apps/admin/review-reports'
import { ReportsNotice as ReportsNotice_0b61006e31d9472851e469ab6a015301 } from '../../../modules/apps/admin/reports-notice'
import { SubmissionsNotice as SubmissionsNotice_b37963b15c0fd770e1f6bd4386ad7502 } from '../../../modules/apps/admin/submissions-notice'
import { RecheckNotice as RecheckNotice_2936e53c9e7b9511c7179f73bff63f63 } from '../../../modules/apps/admin/recheck-notice'
import { ImportBox as ImportBox_240395083c95ae6702fb50945e8d4929 } from '../../../modules/apps/admin/import-box'
import { SubmissionPanel as SubmissionPanel_4bf778e4ff33021d55ae22b7dffc8927 } from '../../../modules/apps/admin/submission-panel'
import { TestFetchButton as TestFetchButton_b1dc21837ee664b416d7310fb91f4040 } from '../../../modules/daily/admin/test-fetch-button'
import { ReviewCell as ReviewCell_2112a3d97e8d3e9907989fea4d7ef9c1 } from '../../../modules/daily/admin/review/links'
import { ReviewField as ReviewField_2112a3d97e8d3e9907989fea4d7ef9c1 } from '../../../modules/daily/admin/review/links'
import { ReviewQueueButton as ReviewQueueButton_2112a3d97e8d3e9907989fea4d7ef9c1 } from '../../../modules/daily/admin/review/links'
import { ReviewQueueView as ReviewQueueView_c111dd891c468b16971f847e61641fc2 } from '../../../modules/daily/admin/review/view'
import { SubscriberOverview as SubscriberOverview_923ce44b0718105cb9207626c55c70a3 } from '../../../modules/daily/email/admin/subscriber-overview'
import { ImportButton as ImportButton_732f6da2a57c9425424227b664ca593e } from '../../../modules/resources/admin/import-button'
import { DescribePanel as DescribePanel_62e1fd9685e86a291070552a381d803d } from '../../../modules/resources/admin/describe-panel'
import { SnapshotStatus as SnapshotStatus_5ae6b63efaca662215fabf9b06a0db06 } from '../../../modules/rankings/admin/snapshot-status'
import { AnswersPanel as AnswersPanel_30251a44f6ba0b489a653addc8e3ce37 } from '../../../modules/rankings/admin/answers-panel'
import { UiLanguageSwitch as UiLanguageSwitch_1ab148fae9b2f4a257e97088aafad126 } from '../../../admin/ui-language/switch'
import { ReviewNavLink as ReviewNavLink_2112a3d97e8d3e9907989fea4d7ef9c1 } from '../../../modules/daily/admin/review/links'
import { ModelUsageNavLink as ModelUsageNavLink_e8dd740ddf39723610754fc9fa3ab578 } from '../../../admin/model-usage/nav-link'
import { AdminLogNavLink as AdminLogNavLink_f6731c953a0e4e47f3848e4b44367eb8 } from '../../../admin/admin-log/nav-link'
import { AdminTheme as AdminTheme_21f744e7bd57342bb26c7c1fc049eaf3 } from '../../../admin/theme/provider'
import { ModelUsageView as ModelUsageView_304a9f7c53a4c3ddf1679b524418e932 } from '../../../admin/model-usage/view'
import { AdminLogView as AdminLogView_a36c77c37339db68486e971f26eb44af } from '../../../admin/admin-log/view'
import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from '@payloadcms/next/rsc'
import { S3ClientUploadHandler as S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24 } from '@payloadcms/storage-s3/client'

/** @type import('payload').ImportMap */
export const importMap = {
  "/modules/apps/admin/draft-panel#DraftPanel": DraftPanel_5d90df983563fe7b2e57964307e17b7f,
  "/modules/apps/admin/heat-panel#HeatPanel": HeatPanel_e2e4e5526093090dcc57b08478fbf79e,
  "/modules/apps/admin/reviews-panel#ReviewsPanel": ReviewsPanel_f4f5fdac6b8d91f90b15d4d825cc5936,
  "/modules/apps/admin/reports-panel#ReportsPanel": ReportsPanel_975fa451eb12132dcbc946d9eb2f8112,
  "/modules/apps/admin/heat-status#HeatStatus": HeatStatus_f910cd358bdcc46e0c7fb035c893c100,
  "/modules/apps/admin/review-reports#ReviewReports": ReviewReports_8e96545e70b9997208c5ec0c15febf45,
  "/modules/apps/admin/reports-notice#ReportsNotice": ReportsNotice_0b61006e31d9472851e469ab6a015301,
  "/modules/apps/admin/submissions-notice#SubmissionsNotice": SubmissionsNotice_b37963b15c0fd770e1f6bd4386ad7502,
  "/modules/apps/admin/recheck-notice#RecheckNotice": RecheckNotice_2936e53c9e7b9511c7179f73bff63f63,
  "/modules/apps/admin/import-box#ImportBox": ImportBox_240395083c95ae6702fb50945e8d4929,
  "/modules/apps/admin/submission-panel#SubmissionPanel": SubmissionPanel_4bf778e4ff33021d55ae22b7dffc8927,
  "/modules/daily/admin/test-fetch-button#TestFetchButton": TestFetchButton_b1dc21837ee664b416d7310fb91f4040,
  "/modules/daily/admin/review/links#ReviewCell": ReviewCell_2112a3d97e8d3e9907989fea4d7ef9c1,
  "/modules/daily/admin/review/links#ReviewField": ReviewField_2112a3d97e8d3e9907989fea4d7ef9c1,
  "/modules/daily/admin/review/links#ReviewQueueButton": ReviewQueueButton_2112a3d97e8d3e9907989fea4d7ef9c1,
  "/modules/daily/admin/review/view#ReviewQueueView": ReviewQueueView_c111dd891c468b16971f847e61641fc2,
  "/modules/daily/email/admin/subscriber-overview#SubscriberOverview": SubscriberOverview_923ce44b0718105cb9207626c55c70a3,
  "/modules/resources/admin/import-button#ImportButton": ImportButton_732f6da2a57c9425424227b664ca593e,
  "/modules/resources/admin/describe-panel#DescribePanel": DescribePanel_62e1fd9685e86a291070552a381d803d,
  "/modules/rankings/admin/snapshot-status#SnapshotStatus": SnapshotStatus_5ae6b63efaca662215fabf9b06a0db06,
  "/modules/rankings/admin/answers-panel#AnswersPanel": AnswersPanel_30251a44f6ba0b489a653addc8e3ce37,
  "/admin/ui-language/switch#UiLanguageSwitch": UiLanguageSwitch_1ab148fae9b2f4a257e97088aafad126,
  "/modules/daily/admin/review/links#ReviewNavLink": ReviewNavLink_2112a3d97e8d3e9907989fea4d7ef9c1,
  "/admin/model-usage/nav-link#ModelUsageNavLink": ModelUsageNavLink_e8dd740ddf39723610754fc9fa3ab578,
  "/admin/admin-log/nav-link#AdminLogNavLink": AdminLogNavLink_f6731c953a0e4e47f3848e4b44367eb8,
  "/admin/theme/provider#AdminTheme": AdminTheme_21f744e7bd57342bb26c7c1fc049eaf3,
  "/admin/model-usage/view#ModelUsageView": ModelUsageView_304a9f7c53a4c3ddf1679b524418e932,
  "/admin/admin-log/view#AdminLogView": AdminLogView_a36c77c37339db68486e971f26eb44af,
  "@payloadcms/next/rsc#CollectionCards": CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1,
  "@payloadcms/storage-s3/client#S3ClientUploadHandler": S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24
}
