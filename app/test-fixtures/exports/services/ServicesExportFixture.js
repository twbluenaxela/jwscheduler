'use client';

import ServicesPdfFixture from '../../services-pdf/ServicesPdfFixture';

// LOCAL TEST ONLY. Re-exports the existing 服務 fixture (real ServicesPage behind
// a mocked /api/services*) under the exports fixture tree, so the export-menu
// suite can drive 下載 PDF / 匯出 JPG from one place. The fixture component is
// shared rather than copied: two mounts of the page would drift.
export default ServicesPdfFixture;
