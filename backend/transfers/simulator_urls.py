from django.urls import path

from transfers.simulator_views import (
    SimulateTransferFailureView,
    SimulateTransferSuccessView,
)


urlpatterns = [
    path(
        "transfers/<uuid:transfer_id>/simulate-success/",
        SimulateTransferSuccessView.as_view(),
        name="provider-simulator-success",
    ),
    path(
        "transfers/<uuid:transfer_id>/simulate-failure/",
        SimulateTransferFailureView.as_view(),
        name="provider-simulator-failure",
    ),
]
