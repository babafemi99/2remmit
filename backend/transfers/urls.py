from django.urls import path

from transfers.views import (
    TransferDetailView,
    TransferActivityListView,
    TransferListCreateView,
    TransferSubmitView,
    TransferCancelView,
    ProviderWebhookView,
)
from transfers.streaming import transfer_activity_stream

urlpatterns = [
    path("transfers/", TransferListCreateView.as_view(), name="transfer-list-create"),
    path("transfers/<uuid:transfer_id>/", TransferDetailView.as_view(), name="transfer-detail"),
    path(
        "transfers/<uuid:transfer_id>/activities/",
        TransferActivityListView.as_view(),
        name="transfer-activity-list",
    ),
    path(
        "transfers/<uuid:transfer_id>/activities/stream/",
        transfer_activity_stream,
        name="transfer-activity-stream",
    ),
    path("transfers/<uuid:transfer_id>/submit/", TransferSubmitView.as_view(), name="transfer-submit"),
    path("transfers/<uuid:transfer_id>/cancel/", TransferCancelView.as_view(), name="transfer-cancel"),
    path("webhooks/provider/", ProviderWebhookView.as_view(), name="provider-webhook"),
]
